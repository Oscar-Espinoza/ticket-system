'use client';

// Signup form (client) — email/password registration via Better Auth.
//
// UI-SPEC contract:
//   - Centered Card (max-w-sm), heading "Create account", subheading
//     "Start managing your tickets".
//   - "Continue with GitHub" button ABOVE the form behind an "or" separator;
//     wired in Plan 03 (AUTH-02): onClick calls authClient.signIn.social, which
//     redirects the browser to GitHub. Per UI-SPEC "OAuth Redirect" the browser
//     navigates away — no spinner. On failure we show the OAuth failure copy.
//   - Validate on submit only; inline errors below the field (text-destructive
//     text-sm); clear a field's error as the user types.
//   - Duplicate email -> "An account with this email already exists. Sign in
//     instead." (USER_ALREADY_EXISTS); 422 (short password) -> "Password must be
//     at least 8 characters."
//   - Loading: Loader2 spinner, disabled button, text "Creating account…".
//
// Name: Better Auth's email/password signup requires a `name`. The Phase 1 UI
// collects only email + password (UI-SPEC), so we derive a default name from the
// email local-part; a real name-entry field is a later-phase concern.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// lucide-react 1.17 dropped the `Github` brand icon; GitBranch is the placeholder
// glyph for the (disabled) OAuth button until Plan 03 wires GitHub sign-in.
import { GitBranch, Loader2 } from 'lucide-react';
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

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGitHubSignIn() {
    setFormError(null);
    // OAuth redirects the browser to GitHub. Per UI-SPEC the browser navigates
    // away (no spinner). We only land back here if signIn.social returns an
    // error before redirecting — surface the OAuth failure copy in that case.
    const { error } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: '/dashboard',
    });
    if (error) {
      setFormError('GitHub sign-in failed. Try again or use email and password.');
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
    const { error } = await authClient.signUp.email({
      name: email.split('@')[0],
      email,
      password,
      callbackURL: '/dashboard',
    });

    if (error) {
      setLoading(false);
      // Better Auth 1.6: duplicate email -> USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
      // (422); too-short password -> PASSWORD_TOO_SHORT (400). Match the
      // USER_ALREADY_EXISTS* family so the mapping survives version drift.
      if (error.code?.startsWith('USER_ALREADY_EXISTS')) {
        setEmailError('An account with this email already exists. Sign in instead.');
      } else if (error.code === 'PASSWORD_TOO_SHORT') {
        setPasswordError('Password must be at least 8 characters.');
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Start managing your tickets</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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

        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
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
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
