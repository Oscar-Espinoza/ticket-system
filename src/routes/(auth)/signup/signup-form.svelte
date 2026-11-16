<!--
  Signup form — email/password
  registration via Better Auth.

  UI-SPEC contract:
    - Centered Card (max-w-sm), heading "Create account", subheading
      "Start managing your tickets".
    - "Continue with GitHub" button ABOVE the form behind an "or" separator;
      authClient.signIn.social redirects the browser to GitHub (no spinner).
      On failure we show the OAuth failure copy.
    - Validate on submit only; inline errors below the field (text-destructive
      text-sm); clear a field's error as the user types.
    - Duplicate email -> "An account with this email already exists. Sign in
      instead." (USER_ALREADY_EXISTS*); short password -> "Password must be at
      least 8 characters." (PASSWORD_TOO_SHORT).
    - Loading: Loader2 spinner, disabled button, text "Creating account…".

  REQUIRE_EMAIL_VERIFICATION on: Better Auth creates the account without a
  session (token null), also for an address that already has one (so the
  answer doesn't reveal it); the form then says to check the inbox.

  Name: Better Auth's email/password signup requires a `name`; we derive a
  default from the email local-part.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { goto } from '$app/navigation';
  // lucide 1.17 dropped the `Github` brand icon; GitBranch stands in.
  import GitBranchIcon from '@lucide/svelte/icons/git-branch';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth-rules';
  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Separator } from '@/lib/components/ui/separator';
  import { authHref } from '@/lib/safe-redirect';
  import GoogleSignInButton from '@/lib/components/auth/google-sign-in-button.svelte';

  let {
    redirectTo,
    githubEnabled = false,
    googleEnabled = false,
  }: {
    redirectTo: string;
    /** GITHUB_CLIENT_ID/SECRET are set on the server; without them the button is hidden. */
    githubEnabled?: boolean;
    /** GOOGLE_CLIENT_ID/SECRET are set on the server. */
    googleEnabled?: boolean;
  } = $props();

  let email = $state('');
  let password = $state('');
  let emailError = $state<string | null>(null);
  let passwordError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let loading = $state(false);
  /** Set when sign-up needs the emailed link before signing in. */
  let checkInbox = $state<string | null>(null);

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
    const { data, error } = await authClient.signUp.email({
      name: email.split('@')[0].slice(0, MAX_NAME_LENGTH),
      email,
      password,
      callbackURL: redirectTo,
    });

    if (error) {
      loading = false;
      // Better Auth 1.6: duplicate email -> USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
      // (422); too-short password -> PASSWORD_TOO_SHORT (400). Match the
      // USER_ALREADY_EXISTS* family so the mapping survives version drift.
      if (error.code === 'SSO_REQUIRED') {
        // The email's domain enforces SSO: accounts are created by signing in with it.
        const login = authHref('/login', redirectTo);
        await goto(`${login}${login.includes('?') ? '&' : '?'}sso=1`);
        return;
      }
      if (error.code?.startsWith('USER_ALREADY_EXISTS')) {
        emailError = m.auth_signup_exists();
      } else if (error.code === 'PASSWORD_TOO_SHORT') {
        passwordError = m.auth_password_min({ min: MIN_PASSWORD_LENGTH });
      } else {
        formError = m.auth_login_generic();
      }
      return;
    }

    if (data && !data.token) {
      loading = false;
      checkInbox = email;
      return;
    }

    // router.push(redirectTo) + router.refresh()
    await goto(redirectTo, { refreshAll: true });
  }
</script>

{#if checkInbox}
<Card class="w-full max-w-sm">
  <CardHeader>
    <CardTitle>{m.auth_signup_check_email()}</CardTitle>
    <CardDescription>
      {m.auth_signup_check_description({ email: checkInbox })}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button href={authHref('/login', redirectTo)} class="w-full">{m.auth_signup_go_sign_in()}</Button>
  </CardContent>
</Card>
{:else}
<Card class="w-full max-w-sm">
  <CardHeader>
    <CardTitle>{m.auth_signup_title()}</CardTitle>
    <CardDescription>{m.auth_signup_subtitle()}</CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-4">
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

    {#if githubEnabled || googleEnabled}
      <div class="flex items-center gap-2">
        <Separator class="flex-1" />
        <span class="text-xs text-muted-foreground">{m.auth_or()}</span>
        <Separator class="flex-1" />
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
      <div class="flex flex-col gap-2">
        <Label for="email">{m.auth_email()}</Label>
        <Input
          id="email"
          type="email"
          placeholder={m.auth_email_placeholder()}
          bind:value={email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'email-error' : undefined}
          oninput={() => {
            if (emailError) emailError = null;
            if (formError) formError = null;
          }}
        />
        {#if emailError}
          <p id="email-error" class="text-destructive text-sm">
            {emailError}
          </p>
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <Label for="password">{m.auth_password()}</Label>
        <Input
          id="password"
          type="password"
          bind:value={password}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? 'password-error' : undefined}
          oninput={() => {
            if (passwordError) passwordError = null;
            if (formError) formError = null;
          }}
        />
        {#if passwordError}
          <p id="password-error" class="text-destructive text-sm">
            {passwordError}
          </p>
        {/if}
      </div>

      {#if formError}<p class="text-destructive text-sm">{formError}</p>{/if}

      <Button type="submit" class="w-full" disabled={loading}>
        {#if loading}<Loader2Icon class="animate-spin" />{/if}
        {loading ? m.auth_signup_creating() : m.auth_signup_title()}
      </Button>
    </form>

    <p class="text-center text-sm text-muted-foreground">
      {m.auth_signup_have_account()}
      <a href={authHref('/login', redirectTo)} class="underline underline-offset-4">{m.auth_sign_in()}</a>
    </p>
  </CardContent>
</Card>
{/if}
