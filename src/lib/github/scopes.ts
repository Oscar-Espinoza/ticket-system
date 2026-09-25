// OAuth scopes the Connect-GitHub flow requests on top of the sign-in scopes
// (read:user, user:email). Client-safe: the settings page passes them to
// authClient.linkSocial.
export const REQUIRED_SCOPES = ['repo', 'admin:repo_hook'] as const;
