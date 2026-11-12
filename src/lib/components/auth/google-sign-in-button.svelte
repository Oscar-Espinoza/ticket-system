<!--
  "Continue with Google". Rendered only when the server reports Google sign-in
  as configured (googleSignInEnabled in src/lib/auth-providers.ts, passed down
  by the login / sign-up page loads). signIn.social redirects the browser to
  Google; we only get control back when it fails before redirecting. Errors on
  the way back (e.g. account_not_linked) land on /login?error=, which explains them.
-->
<script lang="ts">
  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import { authHref } from '@/lib/safe-redirect';
  import GoogleMark from './google-mark.svelte';

  let {
    redirectTo,
    onerror,
  }: {
    redirectTo: string;
    onerror: (message: string) => void;
  } = $props();

  async function signIn() {
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: redirectTo,
      errorCallbackURL: authHref('/login', redirectTo),
    });
    if (error) onerror('Google sign-in failed. Try again or use email and password.');
  }
</script>

<Button type="button" variant="outline" class="w-full" onclick={signIn}>
  <GoogleMark class="size-4" />
  Continue with Google
</Button>
