# B9 — Email invitations

## Goal
Invite a specific person by email with a role; the shareable link keeps
working (role member).

## UX (settings › Members, owner/admin)
- Invite panel: "Invite by email" (email + role select: owner may pick
  admin/member/guest, admin member/guest) → "Invitation sent". When email is
  not configured (`sendEmail` returns false) the toast offers "Copy link".
- Pending invitations list: email, role, "expires in …"/"Expired", Resend
  (new 7-day expiry + email), Copy link, Revoke.
- Shareable link section unchanged (admins may manage it too).
- `/invite/[token]`: email invites show "Invitation for x@y · role". Signed in
  as another email → explain and offer sign-out-free guidance (no join button).

## Data / actions
- `invite.ts`: `generateInviteLink` (admin; now replaces only the link row —
  `email IS NULL` — so email invites survive), `inviteByEmail`,
  `resendInvitation`, `revokeInvitation`. Rows: `email` lower-cased, `role`,
  `invitedById`, `expiresAt = now + 7d`, 32-byte base64url token.
- `join.ts` `joinProject`: token valid = not expired AND `acceptedAt IS NULL`.
  Email invite → session email must match (case-insensitive) else
  `{error:'wrong-account'}`; claim the row first (`UPDATE … SET accepted_at
  WHERE accepted_at IS NULL RETURNING`) so it's single use; insert member with
  the invite's role (existing member keeps their role). Link invite path is
  unchanged (member, reusable).

## Edge cases
Already a member → error on invite. Re-inviting a pending email replaces its
row (new token). Claim succeeded but insert failed → un-claim, rethrow.
Logged-out path: `/login?redirect=/invite/…` as before (login ignoring
`redirect` is outside B9's files — integration request).
