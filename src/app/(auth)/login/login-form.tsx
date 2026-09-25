'use client';

// Login form (client) — email/password, GitHub and SSO sign-in via Better Auth.
//
// UI-SPEC contract:
//   - Centered Card (max-w-sm), heading "Sign in", subheading "Welcome back".
//   - "Continue with GitHub" / "Continue with SSO" ABOVE the form, behind an
//     "or" separator. OAuth / SSO navigate the browser away (no spinner for
//     GitHub; SSO keeps its button busy until the IdP loads).
//   - Validate on submit only; inline errors below the field (text-destructive
//     text-sm); clear a field's error as the user types.
//   - Loading: Loader2 spinner, disabled button, text "Signing in…".
//
// Redirect races: a password sign-in can answer `twoFactorRedirect` (the
// twoFactorClient plugin sends the browser to /login/two-factor) or, mid
// OAuth-provider flow, `{ redirect, url }` (the client follows it). In both
// cases we must not also router.push.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// lucide-react 1.17 dropped the `Github` brand icon; GitBranch stands in.
import { ArrowLeft, GitBranch, KeyRound, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { authHref } from '../safe-redirect';

const SSO_REQUIRED = 'SSO_REQUIRED';

export function LoginForm({
  redirectTo,
  initialError = null,
  initialSso = false,
}: {
  redirectTo: string;
  /** Friendly copy for an `?error=` coming back from GitHub / an IdP. */
  initialError?: string | null;
  /** Open in SSO mode (`?sso=1`, e.g. from the sign-up page). */
  initialSso?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'sso'>(initialSso ? 'sso' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function handleGitHubSignIn() {
    setFormError(null);
    // OAuth redirects the browser to GitHub. We only land back here if
    // signIn.social returns an error before redirecting.
    const { error } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: redirectTo,
    });
    if (error) {
      setFormError('GitHub sign-in failed. Try again or use email and password.');
    }
  }

  function switchMode(next: 'password' | 'sso') {
    setMode(next);
    setFormError(null);
    setEmailError(null);
    setPasswordError(null);
  }

  async function handleSsoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setFormError(null);
    if (!email.includes('@')) {
      setEmailError('Enter your work email.');
      return;
    }
    setLoading(true);
    // Finds the workspace IdP by email domain; the client follows `{ url, redirect }`.
    const { error } = await authClient.signIn.sso({
      email,
      callbackURL: redirectTo,
      errorCallbackURL: '/login',
    });
    if (error) {
      setLoading(false);
      setFormError(
        error.status === 404
          ? 'Single sign-on isn’t set up for that email domain. Sign in with your password or GitHub.'
          : 'Couldn’t start single sign-on. Try again or contact your workspace admin.',
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);

    if (!email) {
      setEmailError('Email is required.');
      return;
    }
    if (!password) {
      setPasswordError('Password is required.');
      return;
    }

    setLoading(true);
    const { data, error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: redirectTo,
    });

    if (error) {
      setLoading(false);
      if (error.code === SSO_REQUIRED) {
        setMode('sso');
        setFormError('Your workspace requires single sign-on. Continue with SSO below.');
      } else if (error.status === 401) {
        // Better Auth returns 401 for invalid credentials.
        setFormError('Invalid email or password.');
      } else if (error.status === 429) {
        setFormError('Too many attempts. Wait a moment and try again.');
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      return;
    }

    // Second factor or an OAuth continuation: the auth client navigates.
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return;
    if (data && 'redirect' in data && data.redirect) return;

    router.push(redirectTo);
    router.refresh();
  }

  const emailField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="email">{mode === 'sso' ? 'Work email' : 'Email'}</Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        autoFocus={mode === 'sso'}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? 'email-error' : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          if (emailError) setEmailError(null);
          if (formError) setFormError(null);
        }}
      />
      {emailError && (
        <p id="email-error" className="text-destructive text-sm">
          {emailError}
        </p>
      )}
    </div>
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {mode === 'sso' ? 'Use your company’s identity provider' : 'Welcome back'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mode === 'sso' ? (
          <form onSubmit={handleSsoSubmit} className="flex flex-col gap-4" noValidate>
            {emailField}
            {formError && <p className="text-destructive text-sm">{formError}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {loading ? 'Redirecting…' : 'Continue with SSO'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-center text-muted-foreground"
              onClick={() => switchMode('password')}
            >
              <ArrowLeft />
              Other sign-in options
            </Button>
          </form>
        ) : (
          <>
            {/* GitHub OAuth (AUTH-02). Redirects the browser to GitHub on click. */}
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={handleGitHubSignIn}
            >
              <GitBranch />
              Continue with GitHub
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode('sso')}
            >
              <KeyRound />
              Continue with SSO
            </Button>

            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {emailField}

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                    if (formError) setFormError(null);
                  }}
                />
                {passwordError && (
                  <p id="password-error" className="text-destructive text-sm">
                    {passwordError}
                  </p>
                )}
              </div>

              {formError && <p className="text-destructive text-sm">{formError}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href={authHref('/signup', redirectTo)} className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
