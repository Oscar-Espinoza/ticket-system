<!--
  Choose a new password from an emailed reset link. The token arrives in the
  URL fragment (never sent to a server or in a Referer), is removed from the
  address bar, and is posted once to Better Auth's /reset-password. A
  completed reset signs out every session and verifies the address; on an
  unverified account it also removes what a previous holder set up
  (src/lib/server/email-proof.ts onPasswordReset). It never signs in by
  itself, so two-factor is still asked for at the next sign-in.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import Wordmark from '@/lib/components/wordmark.svelte';
  import { authClient } from '@/lib/svelte/auth-client';
  import { MIN_PASSWORD_LENGTH } from '@/lib/auth-rules';
  import { Button } from '@/lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';

  let token = $state<string | null>(null);
  let checked = $state(false);
  let password = $state('');
  let confirm = $state('');
  let formError = $state<string | null>(null);
  let done = $state(false);
  let loading = $state(false);

  onMount(() => {
    token = new URLSearchParams(location.hash.slice(1)).get('token');
    checked = true;
    if (location.hash) void replaceState(`${location.pathname}${location.search}`, page.state);
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!token) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      formError = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      return;
    }
    if (password !== confirm) {
      formError = 'The passwords don’t match.';
      return;
    }
    loading = true;
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    loading = false;
    if (!error) {
      done = true;
      token = null;
    } else if (error.code === 'INVALID_TOKEN') {
      token = null;
    } else if (error.code === 'SSO_REQUIRED') {
      formError = 'Your workspace requires single sign-on, so this account can’t use a password. Sign in with SSO.';
    } else if (error.code === 'PASSWORD_TOO_LONG') {
      formError = 'That password is too long.';
    } else if (error.status === 429) {
      formError = 'Too many attempts. Wait a moment and try again.';
    } else {
      formError = 'Couldn’t reset the password. Try again.';
    }
  }
</script>

<svelte:head>
  <title>Choose a new password · Ticket System</title>
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-sm">
    {#if done}
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CircleCheckIcon class="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Password changed
        </CardTitle>
        <CardDescription>
          Every session of this account was signed out, and its email address is verified. Sign in with the new
          password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button href="/login" class="w-full">Sign in</Button>
      </CardContent>
    {:else if checked && !token}
      <CardHeader>
        <CardTitle>This link doesn’t work</CardTitle>
        <CardDescription>
          Reset links work once, for an hour, and only the newest one. Ask for a new link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button href="/forgot-password" class="w-full">Email me a new link</Button>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>This signs out every session of the account, including this browser’s.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
          <div class="flex flex-col gap-2">
            <Label for="new-password">New password</Label>
            <Input id="new-password" type="password" autocomplete="new-password" bind:value={password} />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="confirm-password">Repeat it</Label>
            <Input id="confirm-password" type="password" autocomplete="new-password" bind:value={confirm} />
          </div>
          {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
          <Button type="submit" class="w-full" disabled={loading || !token}>
            {#if loading}<Loader2Icon class="animate-spin" />{/if}
            {loading ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </CardContent>
    {/if}
  </Card>
</div>
