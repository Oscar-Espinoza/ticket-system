<!--
  Asks Better Auth (/request-password-reset) to email a reset link. The answer
  is the same whether or not the address has an account (Better Auth answers
  "sent" either way and the server sends at most one link a minute per
  account), so the page never says whether an account exists. Domains that
  enforce SSO get SSO_REQUIRED, the same as on the sign-in form.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
      formError = m.auth_forgot_enter_email();
      return;
    }
    loading = true;
    // The server fixes where the link goes; redirectTo is ignored.
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    loading = false;
    if (!error) {
      sentTo = email;
    } else if (error.code === 'SSO_REQUIRED') {
      formError = m.auth_forgot_sso();
    } else if (error.status === 429) {
      formError = m.auth_too_many_requests();
    } else {
      formError = m.auth_email_send_failed();
    }
  }
</script>

<svelte:head>
  <title>{m.auth_forgot_page_title()}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle>{sentTo ? m.auth_forgot_check_email() : m.auth_forgot_title()}</CardTitle>
      <CardDescription>
        {#if sentTo}
          {m.auth_forgot_sent({ email: sentTo })}
        {:else}
          {m.auth_forgot_intro()}
        {/if}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      {#if !sentTo}
        <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
          <div class="flex flex-col gap-2">
            <Label for="email">{m.auth_email()}</Label>
            <Input id="email" type="email" autocomplete="email" placeholder={m.auth_email_placeholder()} bind:value={email} />
          </div>
          {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
          <Button type="submit" class="w-full" disabled={loading}>
            {#if loading}<Loader2Icon class="animate-spin" />{/if}
            {loading ? m.auth_forgot_sending() : m.auth_forgot_send()}
          </Button>
        </form>
      {/if}
      <p class="text-center text-sm text-muted-foreground">
        <a href="/login" class="underline underline-offset-4">{m.auth_back_to_sign_in()}</a>
      </p>
    </CardContent>
  </Card>
</div>
