# B3 — Create branch from issue

## Goal
One click creates `<login>/<key>-<slug>` on the connected repo from the default
branch head, using the clicking user's own token (GH-02).

## UX
Issue header `HeaderGithub`: GitBranch icon button → DropdownMenu:
- Copy git branch name (⌘⇧.)
- Create branch on GitHub — disabled with a tooltip reason when the project has
  no repo ("Connect a repository in Settings → GitHub") or the viewer has no
  GitHub token ("Connect your GitHub account in Settings → GitHub"), or the
  viewer can't write. Success toast with "Open" action linking to the branch.
Also registered as palette commands while an issue is open.

## Data / actions
- `getGithubViewer(projectId)` read → `{ repo, connected, login }` (cached per
  project in a client module map, one request per session).
- `createBranch(projectId, ticketId)` write → name = stored `githubBranch` ??
  `branchNameFor(login, key, title)`; `repos.get` → `default_branch`;
  `git.getRef('heads/<default>')` → sha; `git.createRef('refs/heads/<name>')`.
  422 "Reference already exists" → ok with `existed: true`. Stores
  `ticket.githubBranch` when null; emits `github.branch_created`
  (`data.summary: "created branch <name>"`, key, title, branch, repo).
- UI refreshes via `router.refresh()` so the frozen host's Branch row appears.

## Edge cases
401 → reconnect message; 403/404 → "no push access / token lacks repo scope";
empty repo (no default branch ref, 409) → "Repository is empty".
