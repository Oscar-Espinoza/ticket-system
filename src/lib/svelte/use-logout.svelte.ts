// Sign out, then go to /login with fresh data (port of src/hooks/use-logout.ts).
//
//   const logout = useLogout();
//   <button onclick={logout.logout} disabled={logout.loading}>Log out</button>
//
// `loading` is a reactive getter — read it as `logout.loading`, don't destructure it.

import { goto } from '$app/navigation';

import { authClient } from '@/lib/svelte/auth-client';

export function useLogout() {
  let loading = $state(false);

  async function logout() {
    if (loading) return;
    loading = true;
    await authClient.signOut();
    // router.push('/login') + router.refresh()
    await goto('/login', { refreshAll: true });
  }

  return {
    logout,
    get loading() {
      return loading;
    },
  };
}
