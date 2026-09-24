'use client';

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
