<!--
  Login form (port of src/app/(auth)/login/login-form.tsx) — email/password,
  GitHub, Google (when configured) and SSO sign-in via Better Auth.

  UI-SPEC contract:
    - Centered Card (max-w-sm), heading "Sign in", subheading "Welcome back".
    - "Continue with GitHub" / "Continue with SSO" ABOVE the form, behind an
      "or" separator. OAuth / SSO navigate the browser away (no spinner for
      GitHub; SSO keeps its button busy until the IdP loads).
    - Validate on submit only; inline errors below the field (text-destructive
      text-sm); clear a field's error as the user types.
    - Loading: Loader2 spinner, disabled button, text "Signing in…".

  Errors stay until a real edit: `?error=` copy and sign-in errors are cleared
  only by typing / pasting (an InputEvent) or a new submit. Browser autofill
  of saved credentials fires plain `input` events (no InputEvent), often on the
  first click anywhere on the page, which used to wipe the message before it
  could be read.

  Unverified email: `account_not_linked` (?error=) shows the three steps that
  fix it (sign in with the password, verify from the banner, continue with
  Google/GitHub) and, for someone who never set that password, "Forgot
  password?". EMAIL_NOT_VERIFIED (REQUIRE_EMAIL_VERIFICATION on) says a fresh
  link was emailed (the server sends one for a correct password). Nothing here
  sends a verification email signed out: only the account's signed-in holder
  can (banner, Settings), so this page can't be used to mail other people.

  Redirect races: a password sign-in can answer `twoFactorRedirect` (the
  twoFactorClient plugin sends the browser to /login/two-factor) or, mid
  OAuth-provider flow, `{ redirect, url }` (the client follows it). In both
  cases we must not also navigate.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  // lucide 1.17 dropped the `Github` brand icon; GitBranch stands in.
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import GitBranchIcon from '@lucide/svelte/icons/git-branch';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Separator } from '@/lib/components/ui/separator';
  import { authHref } from '@/lib/safe-redirect';
  import GoogleSignInButton from '@/lib/components/auth/google-sign-in-button.svelte';

  const SSO_REQUIRED = 'SSO_REQUIRED';
  const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

  /** Typing, pasting, deleting: an InputEvent. Autofill / scripts: a plain Event. */
  const isUserEdit = (e: Event) => typeof InputEvent !== 'undefined' && e instanceof InputEvent;

  let {
    redirectTo,
    githubEnabled = false,
    initialError = null,
    initialSso = false,
    googleEnabled = false,
    initialOfferVerification = false,
    passwordResetAvailable = false,
  }: {
    redirectTo: string;
    /** GITHUB_CLIENT_ID/SECRET are set on the server; without them the button is hidden. */
    githubEnabled?: boolean;
    /** Friendly copy for an `?error=` coming back from GitHub / an IdP. */
    initialError?: string | null;
    /** Open in SSO mode (`?sso=1`, e.g. from the sign-up page). */
    initialSso?: boolean;
    /** GOOGLE_CLIENT_ID/SECRET are set on the server. */
    googleEnabled?: boolean;
    /** `?error=account_not_linked` and verification emails can be sent: show the steps instead of `initialError`. */
    initialOfferVerification?: boolean;
    /** "Forgot password?" works (reset emails can be sent). */
    passwordResetAvailable?: boolean;
  } = $props();

  // useState initial values: read once, like React.
  let mode = $state<'password' | 'sso'>(untrack(() => (initialSso ? 'sso' : 'password')));
  let email = $state('');
  let password = $state('');
  let emailError = $state<string | null>(null);
  let passwordError = $state<string | null>(null);
  // account_not_linked help: not cleared by typing (step 1 is to type your password).
  let linkHelp = $state<string | null>(untrack(() => (initialOfferVerification ? initialError : null)));
  let formError = $state<string | null>(untrack(() => (initialOfferVerification ? null : initialError)));
  let loading = $state(false);

  async function handleGitHubSignIn() {
    formError = null;
    // OAuth redirects the browser to GitHub. We only land back here if
    // signIn.social returns an error before redirecting.
    const { error } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: redirectTo,
      errorCallbackURL: authHref('/login', redirectTo),
    });
    if (error) {
      formError = m.auth_login_github_failed();
    }
  }

  function switchMode(next: 'password' | 'sso') {
    mode = next;
    formError = null;
    linkHelp = null;
    emailError = null;
    passwordError = null;
  }

  async function handleSsoSubmit(e: SubmitEvent) {
    e.preventDefault();
    emailError = null;
    formError = null;
    if (!email.includes('@')) {
      emailError = m.auth_login_work_email_required();
      return;
    }
    loading = true;
    // Finds the workspace IdP by email domain; the client follows `{ url, redirect }`.
    const { error } = await authClient.signIn.sso({
      email,
      callbackURL: redirectTo,
      errorCallbackURL: authHref('/login', redirectTo),
    });
    if (error) {
      loading = false;
      formError =
        error.status === 404
          ? m.auth_login_sso_not_set_up()
          : m.auth_login_sso_failed();
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    emailError = null;
    passwordError = null;
    formError = null;

    if (!email) {
      emailError = m.auth_login_email_required();
      return;
    }
    if (!password) {
      passwordError = m.auth_login_password_required();
      return;
    }

    loading = true;
    const { data, error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: redirectTo,
    });

    if (error) {
      loading = false;
      if (error.code === SSO_REQUIRED) {
        mode = 'sso';
        formError = m.auth_login_sso_required();
      } else if (error.code === EMAIL_NOT_VERIFIED) {
        // REQUIRE_EMAIL_VERIFICATION is on and the password was right: the
        // server has emailed a fresh link (at most one a minute).
        formError = m.auth_login_verify_first();
      } else if (error.status === 401) {
        // Better Auth returns 401 for invalid credentials.
        formError = m.auth_login_invalid();
      } else if (error.status === 429) {
        formError = m.auth_login_too_many();
      } else {
        formError = m.auth_login_generic();
      }
      return;
    }

    // Second factor or an OAuth continuation: the auth client navigates.
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return;
    if (data && 'redirect' in data && data.redirect) return;

    // router.push(redirectTo) + router.refresh()
    await goto(redirectTo, { refreshAll: true });
  }

  function onEmailInput(e: Event) {
    if (!isUserEdit(e)) return;
    if (emailError) emailError = null;
    if (formError) formError = null;
  }

  function onPasswordInput(e: Event) {
    if (!isUserEdit(e)) return;
    if (passwordError) passwordError = null;
    if (formError) formError = null;
  }
</script>

{#snippet emailField()}
  <div class="flex flex-col gap-2">
    <Label for="email">{mode === 'sso' ? m.auth_work_email() : m.auth_email()}</Label>
    <Input
      id="email"
      type="email"
      autocomplete="email"
      placeholder={m.auth_email_placeholder()}
      bind:value={email}
      autofocus={mode === 'sso'}
      aria-invalid={emailError ? true : undefined}
      aria-describedby={emailError ? 'email-error' : undefined}
      oninput={onEmailInput}
    />
    {#if emailError}
      <p id="email-error" class="text-destructive text-sm">
        {emailError}
      </p>
    {/if}
  </div>
{/snippet}

<Card class="w-full max-w-sm">
  <CardHeader>
    <CardTitle>{m.auth_login_title()}</CardTitle>
    <CardDescription>
      {mode === 'sso' ? m.auth_login_sso_description() : m.auth_login_welcome()}
    </CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-4">
    {#if mode === 'sso'}
      <form onsubmit={handleSsoSubmit} class="flex flex-col gap-4" novalidate>
        {@render emailField()}
        {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
        <Button type="submit" class="w-full" disabled={loading}>
          {#if loading}<Loader2Icon class="animate-spin" />{:else}<KeyRoundIcon />{/if}
          {loading ? m.auth_login_redirecting() : m.auth_continue_sso()}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="self-center text-muted-foreground"
          onclick={() => switchMode('password')}
        >
          <ArrowLeftIcon />
          {m.auth_login_other_options()}
        </Button>
      </form>
    {:else}
      {#if linkHelp}
        <div role="alert" data-link-help class="flex flex-col gap-2 rounded-md border px-3 py-3 text-sm">
          <p class="text-destructive">{linkHelp}</p>
          <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
            <li>{m.auth_login_help_1()}</li>
            <li>{m.auth_login_help_2()}</li>
            <li>{m.auth_login_help_3()}</li>
          </ol>
          {#if passwordResetAvailable}
            <p class="text-xs text-muted-foreground">
              {m.auth_login_help_reset_intro()}
              <a href="/forgot-password" class="underline underline-offset-4">{m.auth_login_help_reset_link()}</a>
              {m.auth_login_help_reset_rest()}
            </p>
          {/if}
          <p class="text-xs text-muted-foreground">
            {m.auth_login_help_sso()}
          </p>
        </div>
      {/if}
      <!-- GitHub OAuth (AUTH-02). Redirects the browser to GitHub on click. -->
      {#if githubEnabled}
        <Button type="button" variant="default" class="w-full" onclick={handleGitHubSignIn}>
          <GitBranchIcon />
          {m.auth_continue_github()}
        </Button>
      {/if}
      {#if googleEnabled}
        <GoogleSignInButton {redirectTo} onerror={(message) => (formError = message)} />
      {/if}
      <Button
        type="button"
        variant={githubEnabled || googleEnabled ? 'outline' : 'default'}
        class="w-full"
        onclick={() => switchMode('sso')}
      >
        <KeyRoundIcon />
        {m.auth_continue_sso()}
      </Button>

      <div class="flex items-center gap-2">
        <Separator class="flex-1" />
        <span class="text-xs text-muted-foreground">{m.auth_or()}</span>
        <Separator class="flex-1" />
      </div>

      <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
        {@render emailField()}

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <Label for="password">{m.auth_password()}</Label>
            {#if passwordResetAvailable}
              <a href="/forgot-password" class="text-sm text-muted-foreground underline-offset-4 hover:underline">
                {m.auth_forgot_password()}
              </a>
            {/if}
          </div>
          <Input
            id="password"
            type="password"
            autocomplete="current-password"
            bind:value={password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? 'password-error' : undefined}
            oninput={onPasswordInput}
          />
          {#if passwordError}
            <p id="password-error" class="text-destructive text-sm">
              {passwordError}
            </p>
          {/if}
        </div>

        {#if formError}<p role="alert" class="text-destructive text-sm" data-form-error>{formError}</p>{/if}

        <Button type="submit" class="w-full" disabled={loading}>
          {#if loading}<Loader2Icon class="animate-spin" />{/if}
          {loading ? m.auth_signing_in() : m.auth_sign_in()}
        </Button>
      </form>
    {/if}

    <p class="text-center text-sm text-muted-foreground">
      {m.auth_login_no_account()}
      <a href={authHref('/signup', redirectTo)} class="underline underline-offset-4">{m.auth_sign_up()}</a>
    </p>
  </CardContent>
</Card>
