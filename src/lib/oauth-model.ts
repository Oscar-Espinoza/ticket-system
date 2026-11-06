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
