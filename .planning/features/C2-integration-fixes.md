# C2 — Platform integration fixes (Wave C)

Queued cross-agent requests from Wave A/B final reports. One line per fix: what + files.

1. **Hotkeys: Shift** — `Hotkey.shift?`; shift hotkeys require `shiftKey` and also match by physical key
   (`event.code`, since Shift changes `event.key`: `,`→`<`); non-shift hotkeys unchanged (so `?` works).
   `formatHotkey` renders `⇧` / `Shift+` and `' '`/`Space` → "Space". B10's physical-key listener for
   ⇧D / ⇧A / ⌘⇧, becomes registry entries; display-only duplicates removed. Overlay de-dupes identical
   rows (e.g. two IssueShortcuts mounts). — `src/lib/hotkeys.ts`, `src/components/issues/slots/issue-shortcuts.tsx`,
   `src/components/hotkey-overlay.tsx`. B3's double "Copy git branch name" entry lives in
   `issue-detail/slots/header-github.tsx` (not ours) → integration request (`shift: true`, one entry).
2. **Global TooltipProvider** in the root layout (inside ThemeProvider, PWA pieces kept). — `src/app/layout.tsx`
3. **Density boot script** + density CSS move from `AppShell` into the root `<head>` (runs before paint on every
   page; never re-rendered on soft navigation, so no client `<script>` warning). `<html>` already has
   `suppressHydrationWarning`. — `src/app/layout.tsx`, `src/components/app-shell/app-shell.tsx`
4. **NavigationCommands** rendered by `AppShell` next to `ShellFrame`, removed from the favorites slot. —
   `app-shell.tsx`, `app-shell/slots/sidebar-favorites.tsx`
5. **Breadcrumbs** — audit every `src/app/dashboard/**/page.tsx`; workspace / initiative / people / inbox /
   drafts / views / settings already labelled; harden `decodeURIComponent` (malformed `%` would throw). —
   `breadcrumb.tsx`
6. **SW headers** `/sw.js` Cache-Control no-cache + `Service-Worker-Allowed: /`. — `next.config.ts`
7. **Auth redirect** — `safeRedirect()` (same-origin relative path starting `/invite/` or `/dashboard`; rejects
   `//`, schemes, backslashes, control chars). Login/signup pages read `?redirect=` (the invite pages' param),
   signed-in visitors go straight there; forms use it for email sign-in/up, `callbackURL` of GitHub
   sign-in, and the cross-links between login ↔ signup keep it. — `src/app/(auth)/**`
8. **Env** — `GITHUB_WEBHOOK_BASE_URL` (optional, commented) in both; `RESEND_API_KEY` / `EMAIL_FROM` in
   `.env.example`. — `env.template`, `.env.example`
9. **One app-origin helper** — email templates use `appUrl()`; `appOrigin` kept as an alias export for
   `notifications/dispatch.ts` (C3's) → integration request to import `appUrl` directly. —
   `src/lib/notifications/email-templates.ts`
10. **Attachment cap 4 MB** — `MAX_ATTACHMENT_BYTES` + exported `MAX_ATTACHMENT_LABEL`; server copy in the
    route + `lib/attachments.ts`. Client check follows the constant; its copy lives in
    `issue-detail/slots/section-attachments.tsx` (not ours) → integration request. —
    `attachment-utils.ts`, `src/lib/attachments.ts`, `src/app/api/attachments/route.ts`
11. **Project favorite** — `<FavoriteButton targetType="project" targetId={id} />` in the project header. —
    `src/app/dashboard/projects/[id]/layout.tsx`
12. **Unarchive** — `unarchive(issue, onDone?)` on `IssueMutations` (`unarchiveIssue`, undo = `archive`);
    `archive`'s undo now unarchives. Archive page uses it; trash keeps Restore. —
    `use-issue-mutations.ts`, `src/components/navigation/issue-bin.tsx`
13. **Menu hints** — `DropdownMenuShortcut` with `formatHotkey` (`⌘⇧,` Copy link, `⌘.` Copy ID). —
    `src/components/issue-detail/issue-detail.tsx`
14. **CONTRACTS.md** — B5 filters/display shapes, B8 epics/initiatives/timeline, B10 productivity APIs,
    hotkey `shift`, `unarchive`, `MAX_ATTACHMENT_BYTES`, `safeRedirect`.

Edge cases: ⌘⇧, on non-US layouts matched by `event.code === 'Comma'`; registry still skips editable targets
and open layers for bare keys; `/login?redirect=//evil.com` → `/dashboard`.
