'use client';

// Logout button (D-10) — reachable from the dashboard top nav. Single click,
// no confirmation dialog (logout is low-stakes; UI-SPEC Destructive Actions).
// Clears the session via Better Auth, then redirects to /login.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={loading}>
      {loading && <Loader2 className="animate-spin" />}
      Log out
    </Button>
  );
}
