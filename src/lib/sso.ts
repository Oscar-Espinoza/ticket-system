// Workspace SSO (SAML / OIDC via @better-auth/sso) and SCIM provisioning
// (@better-auth/scim) glue. There is no Better Auth organization plugin here,
// so `workspace_sso` links a workspace to its `sso_provider` (providerId
// `sso-<workspaceId>`) and `scim_provider` (providerId `scim-<workspaceId>`).
//
// Trust model: the plugins' self-service provider CRUD is disabled
// (auth.ts `disabledPaths`) — otherwise any signed-in user could register an
// IdP for any domain. Only workspace owners/admins configure a provider, for a
// domain they proved (DNS TXT or their own verified email), and every SSO /
// SCIM identity must have an email on that domain (assertIdentityDomain). With
// that in place the IdP is the authority for the domain, so it may link to
// existing accounts on it (see ssoCallbackContext).
//
// Server-only. Imported by src/lib/auth.ts — never import auth.ts / session.ts.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup, resolveTxt } from 'node:dns/promises';
import { isPublicRoutableHost } from '@better-auth/core/utils/host';
import { discoverOIDCConfig } from '@better-auth/sso';
import { APIError } from 'better-auth/api';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  accounts,
  projectMembers,
  projects,
  scimProviders,
  sessions,
  ssoProviders,
  users,
  workspaceMembers,
  workspaceSso,
  workspaces,
} from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import { recordWorkspaceEvent } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Ids and URLs
// ---------------------------------------------------------------------------

const SSO_PREFIX = 'sso-';
const SCIM_PREFIX = 'scim-';

export const ssoProviderIdFor = (workspaceId: string) => `${SSO_PREFIX}${workspaceId}`;
export const scimProviderIdFor = (workspaceId: string) => `${SCIM_PREFIX}${workspaceId}`;

const isSsoProviderId = (id: unknown): id is string =>
  typeof id === 'string' && id.startsWith(SSO_PREFIX) && id.length <= 128;
const isScimProviderId = (id: unknown): id is string =>
  typeof id === 'string' && id.startsWith(SCIM_PREFIX) && id.length <= 128;

/** Better Auth's base URL (what the plugins build ACS / callback URLs from). */
export function authBaseUrl(): string {
  return `${(process.env.BETTER_AUTH_URL || appUrl()).replace(/\/+$/, '')}/api/auth`;
}

export function workspaceSsoUrls(workspaceId: string) {
  const base = authBaseUrl();
  const providerId = ssoProviderIdFor(workspaceId);
  const metadataUrl = `${base}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`;
  return {
    providerId,
    acsUrl: `${base}/sso/saml2/sp/acs/${providerId}`,
    /** SP entity ID = the metadata URL (what IdPs expect as the audience). */
    spEntityId: metadataUrl,
    metadataUrl,
    oidcRedirectUri: `${base}/sso/callback/${providerId}`,
    scimBaseUrl: `${base}/scim/v2`,
  };
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Consumer mailbox providers: nobody may claim these for a workspace. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  'fastmail.com',
  'hey.com',
  'qq.com',
  '163.com',
  'tutanota.com',
  'users.noreply.github.com',
]);

export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const domain = input.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
  return DOMAIN_RE.test(domain) ? domain : null;
}

export const isFreeMailDomain = (domain: string) => FREE_MAIL_DOMAINS.has(domain);

export const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

/** Same rule as the SSO plugin: the domain itself or any subdomain of it. */
export const domainMatches = (domain: string, providerDomain: string) =>
  domain === providerDomain || domain.endsWith(`.${providerDomain}`);

/** DNS record an admin publishes to prove the domain: `_ticket-system.<domain>` TXT. */
export const DOMAIN_TXT_LABEL = '_ticket-system';

export function domainVerificationValue(workspaceId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  const digest = createHmac('sha256', secret).update(`sso-domain:${workspaceId}`).digest('hex');
  return `ticket-system-verification=${digest.slice(0, 32)}`;
}

export async function hasDomainTxtRecord(domain: string, workspaceId: string): Promise<boolean> {
  const expected = domainVerificationValue(workspaceId);
  try {
    const records = await resolveTxt(`${DOMAIN_TXT_LABEL}.${domain}`);
    return records.some((chunks) => chunks.join('').trim() === expected);
  } catch {
    return false;
  }
}

/** Local IdPs (Keycloak on localhost, test domains) can't publish DNS. */
export const domainProofOptional = () => process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// OIDC discovery (at save time)
// ---------------------------------------------------------------------------

/**
 * Resolve an issuer's endpoints once, when an admin saves the provider, and
 * store them: runtime discovery would require every IdP origin in
 * trustedOrigins. Production only fetches publicly routable hosts (the URL is
 * admin input — no SSRF into the private network); development allows a
 * local Keycloak. Throws DiscoveryError / Error with a readable message.
 */
export async function discoverOidcEndpoints(issuer: string) {
  const allowPrivate = domainProofOptional();
  const isPublicUrl = (url: string) => {
    try {
      return allowPrivate || isPublicRoutableHost(new URL(url).hostname);
    } catch {
      return false;
    }
  };
  if (!allowPrivate) {
    const host = new URL(issuer).hostname;
    const resolved = await lookup(host, { all: true }).catch(() => []);
    if (!isPublicRoutableHost(host) || resolved.some((r) => !isPublicRoutableHost(r.address))) {
      throw new Error('The issuer must be a public address.');
    }
  }
  return discoverOIDCConfig({ issuer, isTrustedOrigin: isPublicUrl, timeout: 8_000 });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type SsoProtocol = 'saml' | 'oidc';

export interface WorkspaceSsoView {
  enforced: boolean;
  scimConfigured: boolean;
  provider: {
    providerId: string;
    protocol: SsoProtocol;
    domain: string;
    issuer: string;
    saml: { entryPoint: string; hasMetadata: boolean; hasCert: boolean } | null;
    oidc: { clientId: string; hasSecret: boolean } | null;
  } | null;
  /** Members who have signed in with this workspace's SSO at least once. */
  ssoMemberIds: string[];
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export interface StoredSamlConfig {
  issuer: string;
  entryPoint?: string;
  cert?: string;
  callbackUrl?: string;
  idpMetadata?: { metadata?: string; entityID?: string; cert?: string };
  spMetadata?: { entityID?: string };
  identifierFormat?: string;
  mapping?: Record<string, string>;
}

export interface StoredOidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  discoveryEndpoint: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksEndpoint?: string;
  userInfoEndpoint?: string;
  tokenEndpointAuthentication?: 'client_secret_basic' | 'client_secret_post';
  pkce: boolean;
  scopes: string[];
}

export async function getWorkspaceSso(workspaceId: string): Promise<WorkspaceSsoView> {
  const [link] = await db
    .select({
      enforced: workspaceSso.enforced,
      scimProviderId: workspaceSso.scimProviderId,
      providerId: ssoProviders.providerId,
      domain: ssoProviders.domain,
      issuer: ssoProviders.issuer,
      samlConfig: ssoProviders.samlConfig,
      oidcConfig: ssoProviders.oidcConfig,
    })
    .from(workspaceSso)
    .leftJoin(ssoProviders, eq(ssoProviders.providerId, workspaceSso.ssoProviderId))
    .where(eq(workspaceSso.workspaceId, workspaceId))
    .limit(1);
  if (!link) return { enforced: false, scimConfigured: false, provider: null, ssoMemberIds: [] };

  let provider: WorkspaceSsoView['provider'] = null;
  if (link.providerId && link.domain && link.issuer) {
    const saml = parseJson<StoredSamlConfig>(link.samlConfig);
    const oidc = parseJson<StoredOidcConfig>(link.oidcConfig);
    provider = {
      providerId: link.providerId,
      protocol: oidc ? 'oidc' : 'saml',
      domain: link.domain,
      issuer: link.issuer,
      saml: saml
        ? {
            entryPoint: saml.entryPoint ?? '',
            hasMetadata: !!saml.idpMetadata?.metadata,
            hasCert: !!(saml.cert || saml.idpMetadata?.cert),
          }
        : null,
      oidc: oidc ? { clientId: oidc.clientId, hasSecret: !!oidc.clientSecret } : null,
    };
  }

  const ssoMembers = provider
    ? await db
        .select({ userId: accounts.userId })
        .from(accounts)
        .innerJoin(
          workspaceMembers,
          and(
            eq(workspaceMembers.userId, accounts.userId),
            eq(workspaceMembers.workspaceId, workspaceId),
          ),
        )
        .where(eq(accounts.providerId, provider.providerId))
    : [];

  return {
    enforced: link.enforced && !!provider,
    scimConfigured: !!link.scimProviderId,
    provider,
    ssoMemberIds: ssoMembers.map((m) => m.userId),
  };
}

/** The configured provider (workspace + domain) for an SSO providerId, or null. */
async function ssoLink(providerId: string) {
  const [row] = await db
    .select({ workspaceId: workspaceSso.workspaceId, domain: ssoProviders.domain })
    .from(workspaceSso)
    .innerJoin(ssoProviders, eq(ssoProviders.providerId, workspaceSso.ssoProviderId))
    .where(eq(workspaceSso.ssoProviderId, providerId))
    .limit(1);
  return row ?? null;
}

/** Workspace of a SCIM providerId (+ its SSO domain when SSO is configured). */
async function scimLink(providerId: string) {
  const [row] = await db
    .select({ workspaceId: workspaceSso.workspaceId, domain: ssoProviders.domain })
    .from(workspaceSso)
    .leftJoin(ssoProviders, eq(ssoProviders.providerId, workspaceSso.ssoProviderId))
    .where(eq(workspaceSso.scimProviderId, providerId))
    .limit(1);
  return row ?? null;
}

/** Enforced SSO covering this email's domain (or a parent domain), if any. */
export async function enforcedSsoForEmail(email: string) {
  if (!email.includes('@')) return null;
  const domain = emailDomain(email);
  const [row] = await db
    .select({ workspaceId: workspaceSso.workspaceId, domain: ssoProviders.domain })
    .from(workspaceSso)
    .innerJoin(ssoProviders, eq(ssoProviders.providerId, workspaceSso.ssoProviderId))
    .where(
      and(
        eq(workspaceSso.enforced, true),
        sql`(${ssoProviders.domain} = ${domain} or ${domain} like '%.' || ${ssoProviders.domain})`,
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Membership changes driven by SSO / SCIM
// ---------------------------------------------------------------------------

async function userName(userId: string) {
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

export async function addWorkspaceMember(workspaceId: string, userId: string, via: 'sso' | 'scim') {
  const inserted = await db
    .insert(workspaceMembers)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      userId,
      role: 'member',
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: workspaceMembers.id });
  if (inserted.length === 0) return;
  const user = await userName(userId);
  await recordWorkspaceEvent(workspaceId, {
    actorId: via === 'sso' ? userId : null,
    type: via === 'sso' ? 'security.sso_member_joined' : 'security.scim_member_provisioned',
    summary:
      via === 'sso'
        ? `${user?.name ?? 'A user'} joined the workspace via SSO`
        : `provisioned ${user?.name ?? 'a user'} via SCIM`,
    data: { userId, email: user?.email ?? null },
  });
}

/**
 * SCIM deprovisioning: remove the user from the workspace and its teams and
 * sign them out. The workspace owner and team owners keep their seats (a team
 * can't be left without an owner) — reported in the audit event.
 */
export async function removeFromWorkspace(workspaceId: string, userId: string) {
  const [workspace] = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return;
  const user = await userName(userId);
  if (workspace.ownerId === userId) {
    await recordWorkspaceEvent(workspaceId, {
      actorId: null,
      type: 'security.scim_deprovision_skipped',
      summary: `kept ${user?.name ?? 'a user'} — the workspace owner can't be deprovisioned`,
      data: { userId },
    });
    return;
  }

  const teams = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), ne(projects.ownerId, userId)));
  const teamIds = teams.map((t) => t.id);

  await db.batch([
    db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.userId, userId),
          inArray(projectMembers.projectId, teamIds.length ? teamIds : ['']),
          ne(projectMembers.role, 'owner'),
        ),
      ),
    db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          ne(workspaceMembers.role, 'owner'),
        ),
      ),
    db.delete(sessions).where(eq(sessions.userId, userId)),
  ]);

  await recordWorkspaceEvent(workspaceId, {
    actorId: null,
    type: 'security.scim_member_deprovisioned',
    summary: `deprovisioned ${user?.name ?? 'a user'} via SCIM`,
    data: { userId, email: user?.email ?? null },
  });
}

// ---------------------------------------------------------------------------
// Better Auth hook bodies (wired in src/lib/auth.ts)
// ---------------------------------------------------------------------------

type FindUser = (userId: string) => Promise<{ email: string } | null>;

/**
 * account.create.before: an SSO or SCIM identity must carry an email on the
 * workspace's SSO domain, so a workspace's IdP can never mint or take over
 * accounts outside the domain it proved. `findUser` must be transaction-aware
 * (the user may have been created in the same transaction).
 */
export async function assertIdentityDomain(
  account: { providerId: string; userId: string },
  findUser: FindUser,
) {
  let domain: string | null = null;
  if (isSsoProviderId(account.providerId)) {
    const link = await ssoLink(account.providerId);
    if (!link) throw APIError.from('FORBIDDEN', { code: 'SSO_NOT_CONFIGURED', message: 'sso_not_configured' });
    domain = link.domain;
  } else if (isScimProviderId(account.providerId)) {
    domain = (await scimLink(account.providerId))?.domain ?? null;
  }
  if (!domain) return;
  const user = await findUser(account.userId);
  if (user && !domainMatches(emailDomain(user.email), domain)) {
    throw APIError.from('FORBIDDEN', {
      code: 'EMAIL_DOMAIN_NOT_ALLOWED',
      message: 'email_domain_not_allowed',
    });
  }
}

/**
 * account.create.after: SSO sign-ins and SCIM provisioning join the
 * workspace. Linking SSO to an account whose email was never verified also
 * drops that account's password and sessions — whoever registered the address
 * without owning it (pre-account takeover) loses access; the IdP now vouches.
 */
export async function onIdentityCreated(account: { providerId: string; userId: string }) {
  try {
    if (isSsoProviderId(account.providerId)) {
      const link = await ssoLink(account.providerId);
      if (!link) return;
      const [user] = await db
        .select({ emailVerified: users.emailVerified, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, account.userId))
        .limit(1);
      // Older than a minute = an existing account being linked, not a new SSO user.
      if (user && !user.emailVerified && Date.now() - user.createdAt.getTime() > 60_000) {
        await db.batch([
          db
            .delete(accounts)
            .where(and(eq(accounts.userId, account.userId), eq(accounts.providerId, 'credential'))),
          db.delete(sessions).where(eq(sessions.userId, account.userId)),
          db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, account.userId)),
        ]);
      }
      await addWorkspaceMember(link.workspaceId, account.userId, 'sso');
    } else if (isScimProviderId(account.providerId)) {
      const link = await scimLink(account.providerId);
      if (link) await addWorkspaceMember(link.workspaceId, account.userId, 'scim');
    }
  } catch (err) {
    console.error('[sso] failed to add member after identity link', err);
  }
}

/** account.delete.after: a SCIM identity removed → deprovision. */
export async function onIdentityDeleted(account: { providerId: string; userId: string }) {
  if (!isScimProviderId(account.providerId)) return;
  try {
    const link = await scimLink(account.providerId);
    if (link) await removeFromWorkspace(link.workspaceId, account.userId);
  } catch (err) {
    console.error('[sso] failed to deprovision after SCIM delete', err);
  }
}

/** Paths that sign someone in with a first factor other than SSO. */
const NON_SSO_SIGN_IN_PATHS = new Set(['/sign-in/email', '/sign-up/email', '/sign-in/social', '/callback/:id']);

export const isNonSsoSignIn = (path: string | undefined) => !!path && NON_SSO_SIGN_IN_PATHS.has(path);

export const SSO_REQUIRED = {
  code: 'SSO_REQUIRED',
  message: 'Your workspace requires single sign-on. Continue with SSO instead.',
} as const;

/** hooks.before on password sign-in / sign-up: enforced domains must use SSO. */
export async function assertPasswordSignInAllowed(email: unknown) {
  if (typeof email !== 'string' || email.length > 320) return;
  if (await enforcedSsoForEmail(email.toLowerCase())) {
    throw APIError.from('FORBIDDEN', SSO_REQUIRED);
  }
}

// --- SSO callback trust ------------------------------------------------------

const SSO_CALLBACK_PATHS = new Set([
  '/sso/callback/:providerId',
  '/sso/saml2/sp/acs/:providerId',
  '/sso/saml2/callback/:providerId',
]);

/**
 * hooks.before on SSO callbacks: a configured workspace IdP may link to an
 * existing account on its domain even when that account's email was never
 * verified (password sign-ups here have no verification step). Returns the
 * per-request context override, or null. The domain check and
 * onIdentityCreated's cleanup make this safe.
 */
export async function ssoCallbackContext(
  path: string | undefined,
  providerId: unknown,
  options: { account?: { accountLinking?: Record<string, unknown> } },
) {
  if (!path || !SSO_CALLBACK_PATHS.has(path) || !isSsoProviderId(providerId)) return null;
  if (!(await ssoLink(providerId))) return null;
  return {
    options: {
      account: {
        ...options.account,
        accountLinking: { ...options.account?.accountLinking, requireLocalEmailVerified: false },
      },
    },
  };
}

// --- SCIM ------------------------------------------------------------------

/** scim({ canGenerateToken }): only owners/admins of the workspace in the providerId. */
export async function canGenerateScimToken(userId: string, providerId: string): Promise<boolean> {
  if (!isScimProviderId(providerId)) return false;
  const workspaceId = providerId.slice(SCIM_PREFIX.length);
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return member?.role === 'owner' || member?.role === 'admin';
}

/**
 * scim({ linkExistingUsers.shouldLinkUser }): SCIM may adopt an existing
 * account only when it already belongs to the workspace, or its email is on
 * the workspace's (proven) SSO domain.
 */
export async function shouldLinkScimUser(userId: string, email: string, providerId: string) {
  const link = await scimLink(providerId);
  if (!link) return false;
  if (link.domain && domainMatches(emailDomain(email), link.domain)) return true;
  const [member] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, link.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!member;
}

const toBool = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return undefined;
};

/** `active` from a SCIM PUT body or PATCH Operations (Azure sends "False"). */
export function scimActiveChange(method: string | undefined, body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (method === 'PUT') return toBool((body as { active?: unknown }).active);
  if (method !== 'PATCH') return undefined;
  const operations = (body as { Operations?: unknown }).Operations;
  if (!Array.isArray(operations)) return undefined;
  let active: boolean | undefined;
  for (const op of operations) {
    if (!op || typeof op !== 'object') continue;
    const { op: kind, path, value } = op as { op?: unknown; path?: unknown; value?: unknown };
    if (typeof kind !== 'string' || !/^(replace|add)$/i.test(kind)) continue;
    if (typeof path === 'string' && path.toLowerCase() === 'active') active = toBool(value) ?? active;
    else if (!path && value && typeof value === 'object') {
      active = toBool((value as { active?: unknown }).active) ?? active;
    }
  }
  return active;
}

/** Verify a SCIM bearer token (stored hashed) → its providerId, or null. */
async function verifyScimBearer(header: string | null | undefined): Promise<string | null> {
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 512) return null;
  const [base, providerId, ...rest] = Buffer.from(token, 'base64url').toString('utf8').split(':');
  if (!base || !isScimProviderId(providerId) || rest.length > 0) return null;
  const [row] = await db
    .select({ scimToken: scimProviders.scimToken })
    .from(scimProviders)
    .where(eq(scimProviders.providerId, providerId))
    .limit(1);
  if (!row) return null;
  // Same digest as the plugin's storeSCIMToken: 'hashed' (SHA-256, base64url, no padding).
  const digest = Buffer.from(createHash('sha256').update(base).digest('base64url'));
  const stored = Buffer.from(row.scimToken);
  return digest.length === stored.length && timingSafeEqual(digest, stored) ? providerId : null;
}

/**
 * hooks.before on SCIM user PUT/PATCH. The plugin rejects `active: false`
 * without the admin plugin (it maps to a ban), but IdPs deactivate that way —
 * so deactivation deprovisions here and answers directly; reactivation
 * re-adds the member and lets the plugin apply the rest of the update.
 * Returns a SCIM User resource to short-circuit with, or null to continue.
 */
export async function handleScimActiveChange(input: {
  method: string | undefined;
  authorization: string | null | undefined;
  userId: unknown;
  body: unknown;
}): Promise<Record<string, unknown> | null> {
  const active = scimActiveChange(input.method, input.body);
  if (active === undefined || typeof input.userId !== 'string') return null;
  const providerId = await verifyScimBearer(input.authorization);
  if (!providerId) return null; // the plugin's own middleware answers 401
  const link = await scimLink(providerId);
  if (!link) return null;

  const [row] = await db
    .select({
      accountId: accounts.accountId,
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(and(eq(accounts.userId, input.userId), eq(accounts.providerId, providerId)))
    .limit(1);
  if (!row) return null; // plugin answers 404

  if (active) {
    await addWorkspaceMember(link.workspaceId, row.id, 'scim');
    return null;
  }
  await removeFromWorkspace(link.workspaceId, row.id);
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: row.id,
    externalId: row.accountId,
    userName: row.email,
    displayName: row.name,
    name: { formatted: row.name },
    active: false,
    emails: [{ primary: true, value: row.email }],
    meta: {
      resourceType: 'User',
      created: row.createdAt.toISOString(),
      lastModified: new Date().toISOString(),
      location: `${authBaseUrl()}/scim/v2/Users/${row.id}`,
    },
  };
}
