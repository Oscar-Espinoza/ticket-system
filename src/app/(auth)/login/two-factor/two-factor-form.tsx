'use client';

// TOTP code (auto-submits at 6 digits) or a one-time backup code, plus
// "trust this device" (skips the code on this browser for 30 days).

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHref } from '../../safe-redirect';

type ApiError = { status?: number; code?: string; message?: string };

function errorCopy(error: ApiError, backup: boolean): { message: string; expired?: boolean } {
  if (error.code === 'INVALID_TWO_FACTOR_COOKIE' || error.status === 401) {
    return { message: 'This sign-in expired.', expired: true };
  }
  if (error.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
    return { message: 'Too many wrong codes. Wait a few minutes, then sign in again.', expired: true };
  }
  if (error.status === 429) return { message: 'Too many attempts. Wait a moment and try again.' };
  return {
    message: backup
      ? 'That backup code isn’t valid or was already used.'
      : 'That code didn’t match. Try the next code from your app.',
  };
}

export function TwoFactorForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<{ message: string; expired?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function verify(value: string) {
    const trimmed = value.trim();
    if (backup ? trimmed.length < 6 : !/^\d{6}$/.test(trimmed)) {
      setError({ message: backup ? 'Enter a backup code.' : 'Enter the 6-digit code.' });
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: apiError } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: trimmed, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code: trimmed, trustDevice });
    if (apiError) {
      setLoading(false);
      setError(errorCopy(apiError, backup));
      setCode('');
      inputRef.current?.focus();
      return;
    }
    // Mid OAuth-provider flow the client follows `{ redirect, url }` itself.
    if (data && 'redirect' in data && data.redirect) return;
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          {backup
            ? 'Enter one of the backup codes you saved when you turned on 2FA.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{backup ? 'Backup code' : 'Code'}</Label>
            <Input
              ref={inputRef}
              id="code"
              autoFocus
              autoComplete="one-time-code"
              inputMode={backup ? 'text' : 'numeric'}
              maxLength={backup ? 32 : 6}
              placeholder={backup ? 'xxxxx-xxxxx' : '123456'}
              className="font-mono tracking-widest"
              value={code}
              disabled={loading}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'code-error' : undefined}
              onChange={(e) => {
                const next = backup ? e.target.value : e.target.value.replace(/\D/g, '');
                setCode(next);
                setError(null);
                if (!backup && next.length === 6) void verify(next);
              }}
            />
            {error && (
              <p id="code-error" className="text-destructive text-sm">
                {error.message}{' '}
                {error.expired && (
                  <Link href={authHref('/login', redirectTo)} className="underline underline-offset-4">
                    Sign in again
                  </Link>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="trust-device"
              checked={trustDevice}
              onCheckedChange={(checked) => setTrustDevice(checked === true)}
            />
            <Label htmlFor="trust-device" className="font-normal">
              Trust this device for 30 days
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setBackup((value) => !value);
                setCode('');
                setError(null);
                inputRef.current?.focus();
              }}
            >
              {backup ? 'Use authenticator app' : 'Use a backup code'}
            </button>
            <Link
              href={authHref('/login', redirectTo)}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
