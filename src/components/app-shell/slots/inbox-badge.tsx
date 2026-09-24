// Slot stub — owned by B2 (notifications). Rendered by AppShell (server) at the
// end of the sidebar Inbox link; may be async and may nest a client component
// for polling. Return a small count pill, or null when there is nothing unread.

export interface InboxBadgeProps {
  /** Session user id (already authenticated by the dashboard layout). */
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub; owner uses the props
export function InboxBadge(_props: InboxBadgeProps) {
  return null;
}
