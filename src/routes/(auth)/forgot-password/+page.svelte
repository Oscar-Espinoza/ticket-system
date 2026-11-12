<!--
  Asks Better Auth (/request-password-reset) to email a reset link. The answer
  is the same whether or not the address has an account (Better Auth answers
  "sent" either way and the server sends at most one link a minute per
  account), so the page never says whether an account exists. Domains that
  enforce SSO get SSO_REQUIRED, the same as on the sign-in form.
-->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import Wordmark from '@/lib/components/wordmark.svelte';
  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';

  let email = $state('');
  let formError = $state<string | null>(null);
  let sentTo = $state<string | null>(null);
  let loading = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!email.includes('@')) {
      formError = 'Enter your email address.';
      return;
    }
    loading = true;
    // The server fixes where the link goes; redirectTo is ignored.
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    loading = false;
    if (!error) {
      sentTo = email;
    } else if (error.code === 'SSO_REQUIRED') {
      formError = 'Your workspace requires single sign-on, so there is no password to reset. Sign in with SSO.';
    } else if (error.status === 429) {
      formError = 'Too many requests. Wait a minute and try again.';
    } else {
      formError = 'Couldn’t send the email. Try again.';
    }
  }
</script>

<svelte:head>
  <title>Reset your password · Ticket System</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle>{sentTo ? 'Check your email' : 'Reset your password'}</CardTitle>
      <CardDescription>
        {#if sentTo}
          If <span class="font-medium break-all">{sentTo}</span> has an account, a link to choose a new password is on
          its way. It works once, for an hour. Check your spam folder too; you can ask again in a minute.
        {:else}
          We’ll email you a link to choose a new password. Resetting signs out every session of the account and
          verifies its address.
        {/if}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      {#if !sentTo}
        <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
          <div class="flex flex-col gap-2">
            <Label for="email">Email</Label>
            <Input id="email" type="email" autocomplete="email" placeholder="you@example.com" bind:value={email} />
          </div>
          {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
          <Button type="submit" class="w-full" disabled={loading}>
            {#if loading}<Loader2Icon class="animate-spin" />{/if}
            {loading ? 'Sending…' : 'Email me a reset link'}
          </Button>
        </form>
      {/if}
      <p class="text-center text-sm text-muted-foreground">
        <a href="/login" class="underline underline-offset-4">Back to sign in</a>
      </p>
    </CardContent>
  </Card>
</div>
