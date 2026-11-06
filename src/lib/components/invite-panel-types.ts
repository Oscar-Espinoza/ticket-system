import type { AssignableRole } from '@/lib/roles';

export interface PendingInvitation {
  id: string;
  email: string;
  role: AssignableRole;
  /** ISO string. */
  expiresAt: string;
  url: string;
  invitedByName: string | null;
}
