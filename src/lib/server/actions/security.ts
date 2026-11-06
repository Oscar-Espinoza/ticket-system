// Security settings: the viewer's sessions, and workspace SSO / SCIM.
//
// Every action resolves the session itself. Workspace actions need workspace
// owner/admin and only ever touch that workspace's own provider ids
// (`sso-<workspaceId>`, `scim-<workspaceId>`), so client ids can't reach
// another workspace's configuration. See src/lib/sso.ts for the trust model.

import { headers } from '@/lib/kit/request';
import { isAPIError } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scimProviders, sessions, ssoProviders, users, workspaceSso } from '@/db/schema';
import { getSession } from '@/lib/session';
import type { WorkspaceMembership } from '@/lib/workspace-access';
import {
  fail,
  FORBIDDEN,
  isFail,
  NOT_AUTHENTICATED,
  refreshesData,
  type ActionResult,
  type AuthFail,
  type Fail,
} from '@/lib/server/action-kit';
import { authorizeWorkspaceAction } from '@/lib/server/workspace-authz';
import { recordWorkspaceEvent } from '@/lib/audit';
import {
  discoverOidcEndpoints,
  domainMatches,
  domainProofOptional,
  DOMAIN_TXT_LABEL,
  emailDomain,
  getWorkspaceSso,
  hasDomainTxtRecord,
  isFreeMailDomain,
  normalizeDomain,
  parseStored,
  scimProviderIdFor,
  ssoProviderIdFor,
  workspaceSsoUrls,
  type SsoProtocol,
  type StoredOidcConfig,
  type StoredSamlConfig,
} from '@/lib/sso';
import { clippedTextOrEmpty } from '@/lib/text';

export type SecurityField =
  | 'domain'
  | 'samlMetadata'
  | 'samlEntryPoint'
  | 'samlIssuer'
  | 'samlCert'
  | 'oidcIssuer'
  | 'oidcClientId'
  | 'oidcClientSecret';

type SecurityFailure = Fail<SecurityField>;

export type SecurityResult<T extends object = object> = ActionResult<T, SecurityField>;

function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAPIError(err)) return err.body?.message || err.message || fallback;
  console.error('[security]', err);
  return fallback;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Revoke one of the viewer's other sessions (by id — tokens never reach the client). */
export async function revokeSession(input: { sessionId: string }): Promise<SecurityResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  const sessionId = typeof input?.sessionId === 'string' ? input.sessionId : '';
  if (!sessionId) return FORBIDDEN;
  if (sessionId === session.session.id) {
    return fail('This is your current session — use Log out instead.');
  }
  const [row] = await db
    .select({ token: sessions.token })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, session.user.id)))
    .limit(1);
  if (!row) return fail('Session not found.');
  try {
    await auth.api.revokeSession({ headers: await headers(), body: { token: row.token } });
  } catch (err) {
    return fail(apiErrorMessage(err, 'Couldn’t revoke the session.'));
  }
  refreshesData();
  return { ok: true };
}

export async function revokeOtherSessions(): Promise<SecurityResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch (err) {
    return fail(apiErrorMessage(err, 'Couldn’t sign out other sessions.'));
  }
  refreshesData();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workspace SSO
// ---------------------------------------------------------------------------

type WorkspaceAdmin = {
  ok: true;
  userId: string;
  userName: string;
  email: string;
  emailVerified: boolean;
  membership: WorkspaceMembership;
};

async function authorizeWorkspaceAdmin(workspaceId: unknown): Promise<WorkspaceAdmin | AuthFail> {
  const authz = await authorizeWorkspaceAction(workspaceId, 'admin');
  if (!authz.ok) return authz;
  // Fresh from the DB — the session cookie cache may be minutes old.
  const [user] = await db
    .select({ name: users.name, email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, authz.userId))
    .limit(1);
  if (!user) return NOT_AUTHENTICATED;
  return {
    ok: true,
    userId: authz.userId,
    userName: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    membership: authz.membership,
  };
}

export interface SaveSsoInput {
  workspaceId: string;
  protocol: SsoProtocol;
  domain: string;
  /** SAML: IdP metadata XML, or entry point + issuer + certificate. */
  samlMetadata?: string;
  samlEntryPoint?: string;
  samlIssuer?: string;
  samlCert?: string;
  /** OIDC. A blank secret keeps the stored one. */
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
}

const EMAIL_NAME_ID = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
const METADATA_MAX_BYTES = 100_000;
const FIELD_MAX = 2_000;

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    // Local IdPs (Keycloak on localhost) run over http in development.
    const ok = url.protocol === 'https:' || (domainProofOptional() && url.protocol === 'http:');
    return ok && !url.username && !url.password ? url.toString().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

/** PEM or bare base64 → bare base64 (what samlify expects). */
function normalizeCert(value: string): string | null {
  const bare = value
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  return bare.length >= 200 && bare.length <= 20_000 && /^[A-Za-z0-9+/]+=*$/.test(bare) ? bare : null;
}

function buildSamlConfig(
  input: SaveSsoInput,
  urls: ReturnType<typeof workspaceSsoUrls>,
  existing: StoredSamlConfig | null,
): { issuer: string; config: StoredSamlConfig } | SecurityFailure {
  const entryPointInput = clippedTextOrEmpty(input.samlEntryPoint, FIELD_MAX);
  // Blank metadata / certificate on edit = keep the stored one.
  const metadata =
    clippedTextOrEmpty(input.samlMetadata, METADATA_MAX_BYTES + 1) ||
    (!entryPointInput ? (existing?.idpMetadata?.metadata ?? '') : '');
  const common = {
    callbackUrl: urls.acsUrl,
    spMetadata: { entityID: urls.spEntityId },
    identifierFormat: EMAIL_NAME_ID,
    // Lets IdPs vouch for the address (links existing accounts); see the setup notes.
    mapping: { emailVerified: 'email_verified' },
  };

  if (metadata) {
    if (new TextEncoder().encode(metadata).length > METADATA_MAX_BYTES) {
      return fail('Metadata is larger than 100 KB.', 'samlMetadata');
    }
    if (!/<(?:\w+:)?EntityDescriptor[\s>]/.test(metadata) || !/IDPSSODescriptor/.test(metadata)) {
      return fail('That doesn’t look like IdP metadata XML.', 'samlMetadata');
    }
    const entityId = /entityID\s*=\s*"([^"]+)"/.exec(metadata)?.[1] ?? '';
    const issuer = clippedTextOrEmpty(input.samlIssuer, 500) || entityId;
    if (!issuer) return fail('Add the IdP entity ID.', 'samlIssuer');
    const entryPoint = /SingleSignOnService[^>]*Location\s*=\s*"([^"]+)"/.exec(metadata)?.[1];
    return {
      issuer,
      config: { issuer, entryPoint, idpMetadata: { metadata }, ...common },
    };
  }

  const entryPoint = httpUrl(entryPointInput);
  if (!entryPoint) {
    return fail('Paste IdP metadata, or enter the SSO URL.', 'samlEntryPoint');
  }
  const issuer = clippedTextOrEmpty(input.samlIssuer, 500);
  if (!issuer) return fail('Enter the IdP entity ID (issuer).', 'samlIssuer');
  const cert = normalizeCert(clippedTextOrEmpty(input.samlCert, 25_000) || existing?.cert || '');
  if (!cert) return fail('Paste the IdP’s X.509 signing certificate.', 'samlCert');
  return {
    issuer,
    config: {
      issuer,
      entryPoint,
      cert,
      idpMetadata: {
        entityID: issuer,
        cert,
      },
      ...common,
    },
  };
}

async function buildOidcConfig(
  input: SaveSsoInput,
  existing: StoredOidcConfig | null,
): Promise<{ issuer: string; config: StoredOidcConfig } | SecurityFailure> {
  const issuer = httpUrl(clippedTextOrEmpty(input.oidcIssuer, FIELD_MAX));
  if (!issuer) return fail('Enter the issuer URL (https://…).', 'oidcIssuer');
  const clientId = clippedTextOrEmpty(input.oidcClientId, 256);
  if (!clientId) return fail('Enter the client ID.', 'oidcClientId');
  const clientSecret = clippedTextOrEmpty(input.oidcClientSecret, 1_000) || existing?.clientSecret || '';
  if (!clientSecret) {
    return fail('Enter the client secret.', 'oidcClientSecret');
  }
  let discovered: Awaited<ReturnType<typeof discoverOidcEndpoints>>;
  try {
    discovered = await discoverOidcEndpoints(issuer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    return {
      ok: false,
      error: `Couldn’t read ${issuer}/.well-known/openid-configuration — ${reason}`,
      field: 'oidcIssuer',
    };
  }
  return {
    issuer,
    config: {
      issuer,
      clientId,
      clientSecret,
      discoveryEndpoint: discovered.discoveryEndpoint,
      authorizationEndpoint: discovered.authorizationEndpoint,
      tokenEndpoint: discovered.tokenEndpoint,
      jwksEndpoint: discovered.jwksEndpoint,
      userInfoEndpoint: discovered.userInfoEndpoint,
      tokenEndpointAuthentication: discovered.tokenEndpointAuthentication,
      pkce: true,
      scopes: ['openid', 'email', 'profile'],
    },
  };
}

export async function saveWorkspaceSso(input: SaveSsoInput): Promise<SecurityResult> {
  const authz = await authorizeWorkspaceAdmin(input?.workspaceId);
  if (!authz.ok) return authz;
  const workspaceId = authz.membership.workspaceId;
  if (input.protocol !== 'saml' && input.protocol !== 'oidc') return FORBIDDEN;

  const domain = normalizeDomain(input.domain);
  if (!domain) return fail('Enter a domain like acme.com.', 'domain');
  if (isFreeMailDomain(domain)) {
    return fail('Public email domains can’t use SSO.', 'domain');
  }

  const urls = workspaceSsoUrls(workspaceId);
  const [existing] = await db
    .select({
      domain: ssoProviders.domain,
      samlConfig: ssoProviders.samlConfig,
      oidcConfig: ssoProviders.oidcConfig,
    })
    .from(ssoProviders)
    .where(eq(ssoProviders.providerId, urls.providerId))
    .limit(1);

  // Domain proof: the DNS TXT record, always — also for an unchanged domain, so
  // a provider saved before DNS proof was mandatory can't be edited without it.
  // A verified mailbox is NOT proof of the domain (any employee has one).
  // Development skips it for local IdPs.
  if (!domainProofOptional() && !(await hasDomainTxtRecord(domain, workspaceId))) {
    return {
      ok: false,
      error: `Verify ${domain} first: add the ${DOMAIN_TXT_LABEL}.${domain} TXT record shown below, then save again.`,
      field: 'domain',
    };
  }

  // One workspace per domain (including parent/sub-domains): sign-in routes by domain.
  const others = await db
    .select({ domain: ssoProviders.domain })
    .from(ssoProviders)
    .where(ne(ssoProviders.providerId, urls.providerId));
  if (others.some((o) => domainMatches(domain, o.domain) || domainMatches(o.domain, domain))) {
    return fail('Another workspace already uses SSO for this domain.', 'domain');
  }

  let issuer: string;
  let samlConfig: string | null = null;
  let oidcConfig: string | null = null;
  if (input.protocol === 'saml') {
    const built = buildSamlConfig(input, urls, parseStored<StoredSamlConfig>(existing?.samlConfig));
    if (isFail(built)) return built;
    issuer = built.issuer;
    samlConfig = JSON.stringify(built.config);
  } else {
    const built = await buildOidcConfig(input, parseStored<StoredOidcConfig>(existing?.oidcConfig));
    if (isFail(built)) return built;
    issuer = built.issuer;
    oidcConfig = JSON.stringify(built.config);
  }

  const now = new Date();
  const provider = { issuer, domain, samlConfig, oidcConfig, userId: null, organizationId: null };
  await db.batch([
    existing
      ? db.update(ssoProviders).set(provider).where(eq(ssoProviders.providerId, urls.providerId))
      : db.insert(ssoProviders).values({ id: crypto.randomUUID(), providerId: urls.providerId, ...provider }),
    db
      .insert(workspaceSso)
      .values({ workspaceId, ssoProviderId: urls.providerId, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: workspaceSso.workspaceId,
        // A new domain drops enforcement until SSO is proven to work for it.
        set: {
          ssoProviderId: urls.providerId,
          updatedAt: now,
          ...(existing?.domain === domain ? {} : { enforced: false }),
        },
      }),
  ]);

  await recordWorkspaceEvent(workspaceId, {
    actorId: authz.userId,
    type: 'security.sso_configured',
    summary: `${existing ? 'updated' : 'set up'} ${input.protocol.toUpperCase()} single sign-on for ${domain}`,
    data: { protocol: input.protocol, domain, issuer },
  });
  refreshesData();
  return { ok: true };
}

export async function removeWorkspaceSso(input: { workspaceId: string }): Promise<SecurityResult> {
  const authz = await authorizeWorkspaceAdmin(input?.workspaceId);
  if (!authz.ok) return authz;
  const workspaceId = authz.membership.workspaceId;
  const providerId = ssoProviderIdFor(workspaceId);

  const [provider] = await db
    .select({ domain: ssoProviders.domain })
    .from(ssoProviders)
    .where(eq(ssoProviders.providerId, providerId))
    .limit(1);
  if (!provider) return fail('SSO isn’t set up.');

  // Linked SSO identities stay, so re-adding the provider restores them.
  await db.batch([
    db.delete(ssoProviders).where(eq(ssoProviders.providerId, providerId)),
    db
      .update(workspaceSso)
      .set({ ssoProviderId: null, enforced: false, updatedAt: new Date() })
      .where(eq(workspaceSso.workspaceId, workspaceId)),
  ]);
  await recordWorkspaceEvent(workspaceId, {
    actorId: authz.userId,
    type: 'security.sso_removed',
    summary: `removed single sign-on for ${provider.domain}`,
    data: { domain: provider.domain },
  });
  refreshesData();
  return { ok: true };
}

export async function setSsoEnforced(input: {
  workspaceId: string;
  enforced: boolean;
}): Promise<SecurityResult> {
  const authz = await authorizeWorkspaceAdmin(input?.workspaceId);
  if (!authz.ok) return authz;
  const workspaceId = authz.membership.workspaceId;
  const enforced = input.enforced === true;

  const view = await getWorkspaceSso(workspaceId);
  if (!view.provider) return fail('Set up SSO first.');
  if (view.enforced === enforced) return { ok: true };
  if (
    enforced &&
    !domainProofOptional() &&
    !(await hasDomainTxtRecord(view.provider.domain, workspaceId))
  ) {
    return {
      ok: false,
      error: `Publish the ${DOMAIN_TXT_LABEL}.${view.provider.domain} TXT record before requiring SSO.`,
    };
  }
  // Lock-out guard: an admin on the domain must have used SSO successfully.
  if (
    enforced &&
    domainMatches(emailDomain(authz.email), view.provider.domain) &&
    !view.ssoMemberIds.includes(authz.userId)
  ) {
    return {
      ok: false,
      error: 'Sign in with SSO once (log out → Continue with SSO) before enforcing it, so you can’t lock yourself out.',
    };
  }

  await db
    .update(workspaceSso)
    .set({ enforced, updatedAt: new Date() })
    .where(eq(workspaceSso.workspaceId, workspaceId));
  await recordWorkspaceEvent(workspaceId, {
    actorId: authz.userId,
    type: enforced ? 'security.sso_enforced' : 'security.sso_enforcement_disabled',
    summary: enforced
      ? `required SSO for @${view.provider.domain} sign-ins`
      : `stopped requiring SSO for @${view.provider.domain}`,
    data: { domain: view.provider.domain },
  });
  refreshesData();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SCIM
// ---------------------------------------------------------------------------

/** Generates (or rotates) the workspace's SCIM token — returned once, stored hashed. */
export async function generateScimToken(input: {
  workspaceId: string;
}): Promise<SecurityResult<{ token: string }>> {
  const authz = await authorizeWorkspaceAdmin(input?.workspaceId);
  if (!authz.ok) return authz;
  const workspaceId = authz.membership.workspaceId;
  const providerId = scimProviderIdFor(workspaceId);

  const [previous] = await db
    .select({ id: scimProviders.id })
    .from(scimProviders)
    .where(eq(scimProviders.providerId, providerId))
    .limit(1);

  let token: string;
  try {
    // The plugin replaces any previous token for this provider id and runs
    // canGenerateToken (workspace owner/admin) again.
    const result = await auth.api.generateSCIMToken({
      headers: await headers(),
      body: { providerId },
    });
    token = result.scimToken;
  } catch (err) {
    return fail(apiErrorMessage(err, 'Couldn’t generate a SCIM token.'));
  }

  const now = new Date();
  await db
    .insert(workspaceSso)
    .values({ workspaceId, scimProviderId: providerId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: workspaceSso.workspaceId,
      set: { scimProviderId: providerId, updatedAt: now },
    });
  await recordWorkspaceEvent(workspaceId, {
    actorId: authz.userId,
    type: 'security.scim_token_generated',
    summary: previous ? 'rotated the SCIM token' : 'enabled SCIM provisioning',
  });
  refreshesData();
  return { ok: true, token };
}

export async function revokeScimToken(input: { workspaceId: string }): Promise<SecurityResult> {
  const authz = await authorizeWorkspaceAdmin(input?.workspaceId);
  if (!authz.ok) return authz;
  const workspaceId = authz.membership.workspaceId;
  const providerId = scimProviderIdFor(workspaceId);

  await db.batch([
    db.delete(scimProviders).where(eq(scimProviders.providerId, providerId)),
    db
      .update(workspaceSso)
      .set({ scimProviderId: null, updatedAt: new Date() })
      .where(eq(workspaceSso.workspaceId, workspaceId)),
  ]);
  await recordWorkspaceEvent(workspaceId, {
    actorId: authz.userId,
    type: 'security.scim_revoked',
    summary: 'revoked the SCIM token',
  });
  refreshesData();
  return { ok: true };
}
