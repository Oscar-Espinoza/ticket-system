// Client-safe OAuth app types + scope copy shared by the settings page, the
// consent screen and the server actions.

export const APP_NAME_MAX = 60;
export const REDIRECT_URIS_MAX = 10;

/** Scopes every registered app may request (must match oauthProvider scopes in auth.ts). */
export const OAUTH_APP_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'read', 'write'] as const;

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'Confirm your identity',
  profile: 'See your name and avatar',
  email: 'See your email address',
  offline_access: 'Stay connected when you’re not using it',
  read: 'Read your projects, issues and comments',
  write: 'Create and update issues and comments as you',
};

export function describeScope(scope: string): string {
  return SCOPE_DESCRIPTIONS[scope] ?? scope;
}

export interface OAuthAppView {
  clientId: string;
  name: string;
  icon: string | null;
  uri: string | null;
  redirectUris: string[];
  isPublic: boolean;
  /** Turned off (e.g. when an unverified account that registered it was secured): it can't be used. */
  disabled: boolean;
  createdAt: string;
}

export interface AuthorizedAppView {
  /** oauth_consent id. */
  id: string;
  clientId: string;
  name: string;
  icon: string | null;
  uri: string | null;
  scopes: string[];
  grantedAt: string;
}

// ---------------------------------------------------------------------------
// Client-supplied URLs (homepage, logo, terms, privacy policy)
// ---------------------------------------------------------------------------
// Anyone can register a client (dynamic registration, Settings → OAuth apps),
// and these values end up as links and images on our pages. One rule for
// every write path (DCR policy, the Settings action, Better Auth's client
// endpoints via the hook in src/lib/auth.ts): absent, or an absolute https
// URL. Every page that renders one still goes through safeHref.

export const CLIENT_URI_FIELDS = ['client_uri', 'logo_uri', 'tos_uri', 'policy_uri'] as const;
export type ClientUriField = (typeof CLIENT_URI_FIELDS)[number];
export const CLIENT_URI_MAX = 500;

/** `value` as a normalized absolute https URL, or null if it isn't one. */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > CLIENT_URI_MAX) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The first URL field of OAuth client metadata (RFC 7591 names) that is
 * present but not an absolute https URL, or null when all are fine. Absent,
 * null and empty values are fine (nothing is stored or shown).
 */
export function invalidClientUri(metadata: unknown): ClientUriField | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  for (const field of CLIENT_URI_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    if (!httpsUrl(value)) return field;
  }
  return null;
}

/** href for a client-supplied URL: http(s) only, anything else renders as plain text. */
export function safeHref(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Stored client fields shared by both Settings lists. */
interface ClientRow {
  clientId: string;
  name: string | null;
  icon: string | null;
  uri: string | null;
}

/** An app the user registered, as Settings → OAuth apps shows it (URLs through safeHref). */
export function oauthAppView(
  row: ClientRow & { redirectUris: string[]; isPublic: boolean | null; disabled?: boolean | null; createdAt: Date | null },
): OAuthAppView {
  return {
    clientId: row.clientId,
    name: row.name ?? 'Untitled app',
    icon: safeHref(row.icon),
    uri: safeHref(row.uri),
    redirectUris: row.redirectUris,
    isPublic: row.isPublic === true,
    disabled: row.disabled === true,
    createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  };
}

/** An app the user authorized, as Settings → OAuth apps shows it (URLs through safeHref). */
export function authorizedAppView(
  row: ClientRow & { id: string; scopes: string[]; grantedAt: Date | null },
): AuthorizedAppView {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name ?? 'Untitled app',
    icon: safeHref(row.icon),
    uri: safeHref(row.uri),
    scopes: row.scopes,
    grantedAt: (row.grantedAt ?? new Date(0)).toISOString(),
  };
}
