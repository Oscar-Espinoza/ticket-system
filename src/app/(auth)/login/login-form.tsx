'use client';

// Login form (client) — email/password sign-in via Better Auth.
//
// UI-SPEC contract:
//   - Centered Card (max-w-sm), heading "Sign in", subheading "Welcome back".
//   - "Continue with GitHub" button ABOVE the form, behind an "or" separator.
//     DISABLED in Plan 02 — Plan 03 wires its onClick (AUTH-02). Markup is final
//     so Plan 03 only attaches the handler + enables it.
//   - Validate on submit only; inline errors below the field (text-destructive
//     text-sm); clear a field's error as the user types.
//   - Loading: Loader2 spinner, disabled button, text "Signing in…".

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

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: '/dashboard',
    });

    if (error) {
      setLoading(false);
      // Better Auth returns 401 for invalid credentials.
      if (error.status === 401) {
        setFormError('Invalid email or password.');
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
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Plan 03 extension point: enable + wire onClick to GitHub OAuth. */}
        <Button type="button" variant="default" className="w-full" disabled>
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
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
