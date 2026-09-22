'use client';

// Shared sign-out flow — the logic MOVED VERBATIM from the old LogoutButton
// (M3 deletes that button; the avatar menu and the palette's "Log out"
// command both go through this hook). Single click, no confirmation dialog
// (logout is low-stakes; UI-SPEC Destructive Actions).

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';

export function useLogout() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (loading) return;
    setLoading(true);
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return { logout, loading };
}
