<!--
  Signup form (port of src/app/(auth)/signup/signup-form.tsx) — email/password
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

  Name: Better Auth's email/password signup requires a `name`; we derive a
  default from the email local-part.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  // lucide 1.17 dropped the `Github` brand icon; GitBranch stands in.
  import GitBranchIcon from '@lucide/svelte/icons/git-branch';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Separator } from '@/lib/components/ui/separator';
  import { authHref } from '@/app/(auth)/safe-redirect';

  let { redirectTo }: { redirectTo: string } = $props();

  let email = $state('');
  let password = $state('');
  let emailError = $state<string | null>(null);
  let passwordError = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let loading = $state(false);

  async function handleGitHubSignIn() {
    formError = null;
    // OAuth redirects the browser to GitHub. We only land back here if
    // signIn.social returns an error before redirecting.
    const { error } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: redirectTo,
    });
    if (error) {
      formError = 'GitHub sign-in failed. Try again or use email and password.';
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    emailError = null;
    passwordError = null;
    formError = null;

    if (!email) {
      emailError = 'Email is required.';
      return;
    }
    if (!password) {
      passwordError = 'Password is required.';
      return;
    }

    loading = true;
    const { error } = await authClient.signUp.email({
      name: email.split('@')[0],
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
        emailError = 'An account with this email already exists. Sign in instead.';
      } else if (error.code === 'PASSWORD_TOO_SHORT') {
        passwordError = 'Password must be at least 8 characters.';
      } else {
        formError = 'Something went wrong. Please try again.';
      }
      return;
    }

    // router.push(redirectTo) + router.refresh()
    await goto(redirectTo, { refreshAll: true });
  }
</script>

<Card class="w-full max-w-sm">
  <CardHeader>
    <CardTitle>Create account</CardTitle>
    <CardDescription>Start managing your tickets</CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-4">
    <!-- GitHub OAuth (AUTH-02). Redirects the browser to GitHub on click. -->
    <Button type="button" variant="default" class="w-full" onclick={handleGitHubSignIn}>
      <GitBranchIcon />
      Continue with GitHub
    </Button>

    <div class="flex items-center gap-2">
      <Separator class="flex-1" />
      <span class="text-xs text-muted-foreground">or</span>
      <Separator class="flex-1" />
    </div>

    <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
      <div class="flex flex-col gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
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
        <Label for="password">Password</Label>
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
        {loading ? 'Creating account…' : 'Create account'}
      </Button>
    </form>

    <p class="text-center text-sm text-muted-foreground">
      Already have an account?
      <a href={authHref('/login', redirectTo)} class="underline underline-offset-4">Sign in</a>
    </p>
  </CardContent>
</Card>
