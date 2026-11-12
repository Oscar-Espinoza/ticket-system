// Better Auth server instance — the single source of truth for all auth
// operations (consumed by the catch-all API route and every server-side
// session check).
//
// Key constraints:
//   - database: drizzleAdapter(authDb, ...). MUST use `authDb` (neon-serverless /
//     WebSocket). neon-http throws "No transactions support" on user creation
//     (better-auth#4747).
//   - emailAndPassword.minPasswordLength: MIN_PASSWORD_LENGTH (auth-rules.ts);
//     no custom complexity rules.
//   - plugins: [sveltekitCookies()] — lets server actions/handlers set cookies.
//   - Session cookie cache on (5 minutes, see `session` below): a revoked
//     session stays valid for that window; Better Auth falls back to the DB
//     when the cache is stale, so a signed-in refresh never bounces to /login.
//   - NO `runtime = 'edge'` anywhere in the auth path — Better Auth's password
//     hashing relies on the Node runtime (bcryptjs is not Edge-safe).
//
// GitHub OAuth (socialProviders.github) signs in with MINIMAL scopes only
// (read:user, user:email). The elevated scopes (`repo`,
// `admin:repo_hook`) are requested only from Settings → GitHub via
// authClient.linkSocial({ scopes }), which re-runs OAuth for the same
// provider and updates the existing account row's token + scope.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { jwt, twoFactor } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { scim } from '@better-auth/scim';
import { sso } from '@better-auth/sso';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-rules';
import { invalidClientUri } from '@/lib/oauth-model';
import { authDb } from '@/lib/db';
import { recordUserSecurityEvent } from '@/lib/audit';
import { checkDynamicRegistration, markDynamicClient } from '@/lib/server/mcp/register';
import { mcpUrl } from '@/lib/server/mcp/urls';
import {
  assertIdentityDomain,
  assertPasswordSignInAllowed,
  canGenerateScimToken,
  enforcedSsoForEmail,
  ssoSessionAllowed,
  handleScimActiveChange,
  isNonSsoSignIn,
  onIdentityCreated,
  onIdentityDeleted,
  shouldLinkScimUser,
  ssoCallbackContext,
} from '@/lib/sso';
import {
  users,
  sessions,
  accounts,
  verifications,
  twoFactors,
  jwks,
  ssoProviders,
  scimProviders,
  oauthClients,
  oauthAccessTokens,
  oauthRefreshTokens,
  oauthConsents,
} from '@/db/schema';

// Better Auth's Drizzle adapter resolves its logical models by looking up
// `schema[modelName]` using SINGULAR keys (`user`, `session`, `account`,
// `verification`). Our shared schema module exports PLURAL identifiers
// (`users`, `sessions`, ...), so we hand the adapter an explicitly aliased map from model name to table export.
const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  twoFactor: twoFactors,
  jwks,
  ssoProvider: ssoProviders,
  scimProvider: scimProviders,
  oauthClient: oauthClients,
  oauthAccessToken: oauthAccessTokens,
  oauthRefreshToken: oauthRefreshTokens,
  oauthConsent: oauthConsents,
};

/**
 * The header Better Auth reads the client IP from (rate limits, session IP).
 * src/hooks.server.ts sets it on every /api/auth request; never trust it from
 * anywhere else.
 */
export const CLIENT_IP_HEADER = 'x-ticket-system-client-ip';

// Better Auth's OAuth client writes besides /oauth2/register (the DCR policy
// covers that one): Settings → OAuth apps calls the first two through auth.api.
const CLIENT_WRITE_PATHS = new Set([
  '/oauth2/create-client',
  '/oauth2/update-client',
  '/admin/oauth2/create-client',
  '/admin/oauth2/update-client',
]);

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  // Better Auth always requests read:user + user:email for GitHub; `scope`
  // below only restates them (least privilege at sign-in). Tokens are read
  // exclusively through getGitHubToken() in src/lib/github-token.ts, which
  // decrypts them (see `account`).
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ['read:user', 'user:email'],
    },
  },
  // Signed session snapshot in a cookie saves a DB lookup per request. Trade-off:
  // a revoked session stays valid up to maxAge; project membership is still
  // checked against the DB on every request.
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Rate limits (production only) count per client IP. src/hooks.server.ts
  // overwrites this header on every /api/auth request with the address
  // SvelteKit resolved (the socket peer, or ADDRESS_HEADER / XFF_DEPTH behind
  // a proxy; Vercel's edge on Vercel), so a caller can't pick its own bucket.
  advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
  account: {
    // AES-256-GCM at rest, since linked tokens can carry `repo` scope. Rows
    // written before this stay plaintext and still read fine.
    encryptOAuthTokens: true,
    accountLinking: {
      // Email/password users often sign in to GitHub with another address.
      // linkSocial is session-bound, so this only lets a signed-in user attach
      // a GitHub identity they just authenticated as.
      allowDifferentEmails: true,
    },
  },
  // TOTP 2FA, SAML/OIDC SSO, SCIM provisioning, and an OAuth 2.0 provider
  // (third-party "OAuth apps", with jwt for signed tokens/JWKS).
  // sveltekitCookies must stay last.
  plugins: [
    twoFactor({ issuer: 'Ticket System' }),
    jwt(),
    oauthProvider({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'read', 'write'],
      // Discovery is served by src/routes/[x+2e]well-known/oauth-authorization-server/api/auth/+server.ts.
      silenceWarnings: { oauthAuthServerConfig: true },
      // MCP connectors (docs/mcp/PLAN.md D3/D4): Claude and ChatGPT register
      // themselves (policy: src/lib/server/mcp/register.ts, via hooks below)
      // and ask for `resource=<origin>/mcp`, which gets a JWT for that audience.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      validAudiences: [mcpUrl()],
      rateLimit: { register: { window: 60, max: 5 } },
    }),
    // Providers are written only by workspace admins through
    // src/lib/server/actions/security.ts (domain proven, see src/lib/sso.ts), so the
    // IdP's email_verified claim can be trusted; self-service registration off.
    sso({ providersLimit: 0, trustEmailVerified: true }),
    scim({
      storeSCIMToken: 'hashed',
      // Tokens are per workspace (providerId `scim-<workspaceId>`), owners/admins only.
      canGenerateToken: ({ user, providerId, organizationId }) =>
        !organizationId && canGenerateScimToken(user.id, providerId),
      linkExistingUsers: {
        shouldLinkUser: ({ user, email, provider }) =>
          !provider.organizationId && shouldLinkScimUser(user.id, email, provider.providerId),
      },
    }),
    sveltekitCookies(getRequestEvent),
  ],
  // The SSO / SCIM plugins' self-service provider management
  // would let any signed-in user register an IdP for any domain or manage
  // any token; workspace admins use the server actions instead (auth.api
  // calls bypass disabledPaths).
  disabledPaths: [
    '/sso/register',
    '/sso/update-provider',
    '/sso/delete-provider',
    '/sso/providers',
    '/sso/get-provider',
    '/sso/request-domain-verification',
    '/sso/verify-domain',
    '/scim/generate-token',
    '/scim/list-provider-connections',
    '/scim/get-provider-connection',
    '/scim/delete-provider-connection',
    // OAuth apps are created in Settings (server action → auth.api, which
    // these don't block); over HTTP they'd skip the action's checks.
    '/oauth2/create-client',
    '/oauth2/update-client',
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/oauth2/register') {
        const verdict = checkDynamicRegistration(ctx.body);
        if (!verdict.ok) {
          throw new APIError('BAD_REQUEST', { error: verdict.error, error_description: verdict.description });
        }
        return { context: { body: verdict.body } };
      }
      // Client URLs are rendered as links and images (Settings, consent page).
      if (CLIENT_WRITE_PATHS.has(ctx.path)) {
        const fields = ctx.path.endsWith('/update-client') ? ctx.body?.update : ctx.body;
        const bad = invalidClientUri(fields);
        if (bad) {
          throw new APIError('BAD_REQUEST', {
            error: 'invalid_client_metadata',
            error_description: `${bad} must be an absolute https URL.`,
          });
        }
        return;
      }
      // "Enforce SSO": password sign-in / sign-up is refused for the domain.
      if (ctx.path === '/sign-in/email' || ctx.path === '/sign-up/email') {
        await assertPasswordSignInAllowed(ctx.body?.email);
        return;
      }
      if (ctx.path === '/scim/v2/Users/:userId') {
        const resource = await handleScimActiveChange({
          method: ctx.request?.method,
          authorization: ctx.headers?.get('authorization'),
          userId: ctx.params?.userId,
          body: ctx.body,
        });
        if (resource) return ctx.json(resource);
        return;
      }
      const override = await ssoCallbackContext(
        ctx.path,
        ctx.params?.providerId,
        ctx.context.options,
      );
      if (override) return { context: { context: override } };
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/oauth2/register' && ctx.context.returned && !isAPIError(ctx.context.returned)) {
        await markDynamicClient((ctx.context.returned as { client_id?: unknown }).client_id);
        return;
      }
      const userId = ctx.context.session?.user.id;
      if (
        ctx.path === '/two-factor/generate-backup-codes' &&
        userId &&
        ctx.context.returned &&
        !isAPIError(ctx.context.returned)
      ) {
        await recordUserSecurityEvent(userId, {
          actorId: userId,
          type: 'security.2fa_backup_codes_regenerated',
          summary: 'regenerated two-factor backup codes',
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      update: {
        // The two-factor plugin flips twoFactorEnabled on the first verified
        // code (enable) and on /two-factor/disable.
        after: async (user, ctx) => {
          const path = ctx?.path;
          const enabled =
            path?.startsWith('/two-factor/verify-') && user.twoFactorEnabled === true;
          const disabled = path === '/two-factor/disable' && user.twoFactorEnabled === false;
          if (!enabled && !disabled) return;
          await recordUserSecurityEvent(user.id, {
            actorId: user.id,
            type: enabled ? 'security.2fa_enabled' : 'security.2fa_disabled',
            summary: enabled
              ? 'enabled two-factor authentication'
              : 'disabled two-factor authentication',
          });
        },
      },
      delete: {
        // SCIM deprovisioning removes the identity and workspace seats
        // (onIdentityDeleted) but never deletes the account and everything
        // it owns.
        before: async (_user, ctx) => (ctx?.path?.startsWith('/scim/') ? false : undefined),
      },
    },
    account: {
      create: {
        before: async (account, ctx) => {
          await assertIdentityDomain(account, async (id) =>
            ctx ? ctx.context.internalAdapter.findUserById(id) : null,
          );
        },
        after: async (account) => {
          await onIdentityCreated(account);
        },
      },
      delete: {
        after: async (account) => {
          await onIdentityDeleted(account);
        },
      },
    },
    session: {
      create: {
        // Backstop for "Enforce SSO" on GitHub sign-in (email unknown until
        // the OAuth callback). Returning false fails the sign-in.
        before: async (session, ctx) => {
          if (ctx && !(await ssoSessionAllowed(ctx.path, ctx.params?.providerId))) return false;
          if (!ctx || !isNonSsoSignIn(ctx.path)) return;
          const user = await ctx.context.internalAdapter.findUserById(session.userId);
          if (user && (await enforcedSsoForEmail(user.email))) return false;
        },
      },
    },
  },
});
