<!--
  Verification landing page. States: verified / expired / invalid / pending,
  and `sign-in` when the link was opened outside a session of its account
  (?error=SIGN_IN_REQUIRED). A link only verifies for its signed-in holder,
  so the opener proves the password too: this page takes the token from the
  URL fragment (browsers never send fragments to a server or in a Referer),
  removes it from the address bar, asks for the account's password, signs in
  with it (sending the token in a header, which lets an unverified account in
  with REQUIRE_EMAIL_VERIFICATION on), then re-opens the link in that
  session. Someone who doesn't know the password is pointed at "Forgot
  password?" (a reset proves the address and claims a squatted account).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import Wordmark from '@/lib/components/wordmark.svelte';
  import ResendVerificationButton from '@/lib/components/auth/resend-verification-button.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { VERIFICATION_TOKEN_HEADER } from '@/lib/auth-rules';
  import { authHref } from '@/lib/safe-redirect';
  import { authClient } from '@/lib/svelte/auth-client';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  /** The link's token, read once from the fragment; never put back in a URL other than the verify link. */
  let token = $state<string | null>(null);
  /** The address the token names (display only; the server checks the signature). */
  let tokenEmail = $state<string | null>(null);
  let password = $state('');
  let formError = $state<string | null>(null);
  let loading = $state(false);

  function emailOf(jwt: string): string | null {
    try {
      const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(payload)) as { email?: unknown };
      return typeof claims.email === 'string' ? claims.email : null;
    } catch {
      return null;
    }
  }

  onMount(() => {
    if (data.state !== 'sign-in') return;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const value = fragment.get('token');
    if (value) {
      token = value;
      tokenEmail = emailOf(value);
      void replaceState(`${location.pathname}${location.search}`, page.state);
    }
  });

  function verifyUrl(value: string) {
    return `/api/auth/verify-email?${new URLSearchParams({ token: value, callbackURL: data.verifiedPath })}`;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!token || !tokenEmail) return;
    formError = null;
    if (!password) {
      formError = m.auth_verify_enter_password();
      return;
    }
    loading = true;
    const { data: result, error } = await authClient.signIn.email(
      { email: tokenEmail, password },
      { headers: { [VERIFICATION_TOKEN_HEADER]: token } },
    );
    if (error) {
      loading = false;
      if (error.code === 'SSO_REQUIRED') {
        formError = m.auth_verify_sso();
      } else if (error.status === 401) {
        formError = m.auth_verify_wrong_password();
      } else if (error.status === 429) {
        formError = m.auth_login_too_many();
      } else {
        formError = m.auth_login_generic();
      }
      return;
    }
    // Two-factor: the auth client continues at /login/two-factor; the copy
    // above says to open the link again afterwards.
    if (result && 'twoFactorRedirect' in result && result.twoFactorRedirect) return;
    window.location.href = verifyUrl(token);
  }

  const copy = $derived(
    {
      verified: {
        title: m.auth_verify_verified_title(),
        body: data.signedIn ? m.auth_verify_verified_body_in() : m.auth_verify_verified_body_out(),
      },
      expired: {
        title: m.auth_verify_expired_title(),
        body: data.signedIn
          ? m.auth_verify_expired_body_in({ hours: data.linkHours })
          : m.auth_verify_expired_body_out({ hours: data.linkHours }),
      },
      invalid: {
        title: m.auth_reset_bad_link(),
        body: data.signedIn ? m.auth_verify_invalid_body_in() : m.auth_verify_invalid_body_out(),
      },
      'sign-in': {
        title: m.auth_verify_sign_in_title(),
        body: m.auth_verify_sign_in_body(),
      },
      pending: {
        title: m.auth_verify_pending_title(),
        body: m.auth_verify_pending_body(),
      },
    }[data.state],
  );
</script>

<svelte:head>
  <title>{m.auth_page_title({ page: copy.title })}</title>
  <!-- The fragment never leaves the browser; this keeps the page's own URL out of any Referer too. -->
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        {#if data.state === 'verified'}
          <CircleCheckIcon class="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        {:else if data.state !== 'pending' && data.state !== 'sign-in'}
          <TriangleAlertIcon class="size-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        {/if}
        {copy.title}
      </CardTitle>
      <CardDescription>{copy.body}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      {#if data.state === 'sign-in'}
        {#if token && tokenEmail}
          {#if data.signedInEmail && data.signedInEmail.toLowerCase() !== tokenEmail.toLowerCase()}
            <p class="text-sm text-muted-foreground">
              {m.auth_verify_signed_in_as({ email: data.signedInEmail })}
            </p>
          {/if}
          <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate data-verify-sign-in>
            <div class="flex flex-col gap-2">
              <Label for="verify-email">{m.auth_email()}</Label>
              <Input id="verify-email" type="email" value={tokenEmail} readonly autocomplete="username" />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="verify-password">{m.auth_password()}</Label>
              <Input
                id="verify-password"
                type="password"
                autocomplete="current-password"
                bind:value={password}
                aria-invalid={formError ? true : undefined}
              />
            </div>
            {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
            <Button type="submit" class="w-full" disabled={loading}>
              {#if loading}<Loader2Icon class="animate-spin" />{/if}
              {loading ? m.auth_verify_verifying() : m.auth_verify_sign_in_and_verify()}
            </Button>
          </form>
          <p class="text-xs text-muted-foreground">
            {m.auth_verify_2fa_hint()}
          </p>
        {:else}
          <p class="text-sm text-muted-foreground">
            {m.auth_verify_sign_in_then_open()}
          </p>
          <Button href={authHref('/login', data.redirectTo)} class="w-full">{m.auth_sign_in()}</Button>
        {/if}
        {#if data.passwordResetAvailable}
          <p class="text-xs text-muted-foreground">
            {m.auth_verify_reset_intro()}
            <a href="/forgot-password" class="underline underline-offset-4">{m.auth_verify_reset_link()}</a>
            {m.auth_verify_reset_rest()}
          </p>
        {/if}
      {:else}
        {#if data.resendEmail}
          <ResendVerificationButton email={data.resendEmail} variant="default" size="default" />
        {/if}
        {#if data.signedIn}
          <Button href={data.redirectTo} variant={data.resendEmail ? 'ghost' : 'default'} class="w-full">{m.common_continue()}</Button>
        {:else}
          <Button href={authHref('/login', data.redirectTo)} class="w-full">{m.auth_sign_in()}</Button>
        {/if}
      {/if}
    </CardContent>
  </Card>
</div>
