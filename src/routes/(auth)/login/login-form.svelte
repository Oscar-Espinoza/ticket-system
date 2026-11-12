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
  fix it, and EMAIL_NOT_VERIFIED (REQUIRE_EMAIL_VERIFICATION on) explains
  itself; both offer "send verification email" when the server can send it.

  Redirect races: a password sign-in can answer `twoFactorRedirect` (the
  twoFactorClient plugin sends the browser to /login/two-factor) or, mid
  OAuth-provider flow, `{ redirect, url }` (the client follows it). In both
  cases we must not also navigate.
-->
<script lang="ts">
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
  import ResendVerificationButton from '@/lib/components/auth/resend-verification-button.svelte';

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
    emailVerificationAvailable = false,
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
    /** The server can send verification emails (RESEND_API_KEY + EMAIL_FROM). */
    emailVerificationAvailable?: boolean;
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
  // The last sign-in failed with EMAIL_NOT_VERIFIED: offer a new link.
  let notVerified = $state(false);
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
      formError = 'GitHub sign-in failed. Try again or use email and password.';
    }
  }

  function switchMode(next: 'password' | 'sso') {
    mode = next;
    formError = null;
    linkHelp = null;
    notVerified = false;
    emailError = null;
    passwordError = null;
  }

  async function handleSsoSubmit(e: SubmitEvent) {
    e.preventDefault();
    emailError = null;
    formError = null;
    if (!email.includes('@')) {
      emailError = 'Enter your work email.';
      return;
    }
    loading = true;
    // Finds the workspace IdP by email domain; the client follows `{ url, redirect }`.
    const { error } = await authClient.signIn.sso({
      email,
      callbackURL: redirectTo,
      errorCallbackURL: '/login',
    });
    if (error) {
      loading = false;
      formError =
        error.status === 404
          ? 'Single sign-on isn’t set up for that email domain. Sign in with your password or GitHub.'
          : 'Couldn’t start single sign-on. Try again or contact your workspace admin.';
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    emailError = null;
    passwordError = null;
    formError = null;
    notVerified = false;

    if (!email) {
      emailError = 'Email is required.';
      return;
    }
    if (!password) {
      passwordError = 'Password is required.';
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
        formError = 'Your workspace requires single sign-on. Continue with SSO below.';
      } else if (error.code === EMAIL_NOT_VERIFIED) {
        // REQUIRE_EMAIL_VERIFICATION is on and the password was right.
        notVerified = true;
        formError =
          'Verify your email address before signing in: open the link we emailed you, then sign in again.';
      } else if (error.status === 401) {
        // Better Auth returns 401 for invalid credentials.
        formError = 'Invalid email or password.';
      } else if (error.status === 429) {
        formError = 'Too many attempts. Wait a moment and try again.';
      } else {
        formError = 'Something went wrong. Please try again.';
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
    notVerified = false;
  }

  function onPasswordInput(e: Event) {
    if (!isUserEdit(e)) return;
    if (passwordError) passwordError = null;
    if (formError) formError = null;
  }
</script>

{#snippet emailField()}
  <div class="flex flex-col gap-2">
    <Label for="email">{mode === 'sso' ? 'Work email' : 'Email'}</Label>
    <Input
      id="email"
      type="email"
      autocomplete="email"
      placeholder="you@example.com"
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
    <CardTitle>Sign in</CardTitle>
    <CardDescription>
      {mode === 'sso' ? 'Use your company’s identity provider' : 'Welcome back'}
    </CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-4">
    {#if mode === 'sso'}
      <form onsubmit={handleSsoSubmit} class="flex flex-col gap-4" novalidate>
        {@render emailField()}
        {#if formError}<p class="text-destructive text-sm">{formError}</p>{/if}
        <Button type="submit" class="w-full" disabled={loading}>
          {#if loading}<Loader2Icon class="animate-spin" />{:else}<KeyRoundIcon />{/if}
          {loading ? 'Redirecting…' : 'Continue with SSO'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="self-center text-muted-foreground"
          onclick={() => switchMode('password')}
        >
          <ArrowLeftIcon />
          Other sign-in options
        </Button>
      </form>
    {:else}
      {#if linkHelp}
        <div role="alert" data-link-help class="flex flex-col gap-2 rounded-md border px-3 py-3 text-sm">
          <p class="text-destructive">{linkHelp}</p>
          <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
            <li>Sign in below with your email and password.</li>
            <li>
              Verify your email with the link we send you. No email?
              <ResendVerificationButton {email} {redirectTo} label="Email me a verification link" class="mt-1.5" />
            </li>
            <li>Continue with Google or GitHub again: it opens the same account.</li>
          </ol>
          <p class="text-xs text-muted-foreground">
            Using single sign-on? Ask your admin to add an email_verified attribute in the identity provider.
          </p>
        </div>
      {/if}
      <!-- GitHub OAuth (AUTH-02). Redirects the browser to GitHub on click. -->
      {#if githubEnabled}
        <Button type="button" variant="default" class="w-full" onclick={handleGitHubSignIn}>
          <GitBranchIcon />
          Continue with GitHub
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
        Continue with SSO
      </Button>

      <div class="flex items-center gap-2">
        <Separator class="flex-1" />
        <span class="text-xs text-muted-foreground">or</span>
        <Separator class="flex-1" />
      </div>

      <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
        {@render emailField()}

        <div class="flex flex-col gap-2">
          <Label for="password">Password</Label>
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

        {#if formError}<p class="text-destructive text-sm" data-form-error>{formError}</p>{/if}
        {#if notVerified && emailVerificationAvailable}
          <ResendVerificationButton {email} {redirectTo} label="Send a new verification link" />
        {/if}

        <Button type="submit" class="w-full" disabled={loading}>
          {#if loading}<Loader2Icon class="animate-spin" />{/if}
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    {/if}

    <p class="text-center text-sm text-muted-foreground">
      Don&apos;t have an account?
      <a href={authHref('/signup', redirectTo)} class="underline underline-offset-4">Sign up</a>
    </p>
  </CardContent>
</Card>
