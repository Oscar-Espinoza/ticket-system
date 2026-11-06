// Settings → Security: two-factor authentication and active sessions. 2FA state is read from the
// DB — the session cookie cache can lag.

import { getSecuritySettings } from '@/lib/account-settings-read';
import type { SessionView } from '@/lib/components/security/sessions-list.svelte';
import { requireSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { user: viewer, session } = await requireSession();
  const { user, hasPassword, sessionRows } = await getSecuritySettings(viewer.id);

  const currentId = session.id;
  // Current session first, then by last activity.
  const ordered = [
    ...sessionRows.filter((s) => s.id === currentId),
    ...sessionRows.filter((s) => s.id !== currentId),
  ];

  return {
    twoFactorEnabled: user?.twoFactorEnabled === true,
    hasPassword,
    currentId,
    sessions: ordered.map(
      (s): SessionView => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }),
    ),
  };
};
