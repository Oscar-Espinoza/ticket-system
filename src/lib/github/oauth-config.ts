// Whether this server has a GitHub OAuth app (GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET).
// Without one every GitHub sign-in / connect control is hidden: the buttons would
// send people to github.com with an empty client id. Server-only (reads env).

export function githubOAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.GITHUB_CLIENT_ID?.trim() && !!env.GITHUB_CLIENT_SECRET?.trim();
}
