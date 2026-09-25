'use client';

// Settings → Security → Two-factor authentication (Better Auth twoFactor).
//
// Enable is a three-step dialog: confirm password → add the secret to an
// authenticator app and enter the first code (that verification is what
// turns 2FA on) → save the backup codes, shown once. No QR code: that would
// need a QR encoder dependency; every authenticator app accepts the secret
// (and phones open the otpauth:// link directly).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

import { authClient } from '@/lib/auth-client';
import { CopyField } from '@/components/integrations/copy-field';
import { Field } from '@/components/settings/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LabelChip } from '@/components/ui-icons';
import { BackupCodes } from './backup-codes';

type Mode = 'enable' | 'disable' | 'regenerate' | null;

function errorMessage(error: { status?: number; code?: string; message?: string } | null) {
  if (error?.code === 'INVALID_PASSWORD') return 'That password isn’t right.';
  if (error?.status === 429) return 'Too many attempts — wait a few seconds and try again.';
  return error?.message || 'Something went wrong. Try again.';
}

export function TwoFactorSettings({
  enabled: initialEnabled,
  hasPassword,
}: {
  enabled: boolean;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState<Mode>(null);

  if (!hasPassword) {
    return (
      <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
        Two-factor authentication protects password sign-in. You sign in with GitHub or single
        sign-on, so the two-factor settings of that account apply.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          {enabled ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            Authenticator app
            {enabled ? (
              <LabelChip color="done">Enabled</LabelChip>
            ) : (
              <LabelChip>Off</LabelChip>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {enabled
              ? 'Password sign-ins ask for a 6-digit code from your authenticator app, or a backup code.'
              : 'Ask for a 6-digit code from an app like 1Password, Google Authenticator or Authy after your password.'}
          </p>
        </div>
        {!enabled && (
          <Button size="sm" onClick={() => setMode('enable')}>
            Enable
          </Button>
        )}
      </div>
      {enabled && (
        <div className="flex flex-wrap gap-2 pl-11">
          <Button variant="outline" size="sm" onClick={() => setMode('regenerate')}>
            <KeyRound />
            Regenerate backup codes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setMode('disable')}
          >
            Disable
          </Button>
        </div>
      )}

      {mode === 'enable' && (
        <EnableDialog
          onClose={(done) => {
            setMode(null);
            if (done) {
              setEnabled(true);
              router.refresh();
            }
          }}
        />
      )}
      {mode === 'disable' && (
        <PasswordDialog
          title="Disable two-factor authentication?"
          description="Password sign-ins will no longer ask for a code. Your backup codes stop working."
          confirmLabel="Disable"
          destructive
          onClose={() => setMode(null)}
          onConfirm={async (password) => {
            const { error } = await authClient.twoFactor.disable({ password });
            if (error) return errorMessage(error);
            setEnabled(false);
            setMode(null);
            toast.success('Two-factor authentication disabled');
            router.refresh();
            return null;
          }}
        />
      )}
      {mode === 'regenerate' && <RegenerateDialog onClose={() => setMode(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PasswordDialog({
  title,
  description,
  confirmLabel,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null on success. */
  onConfirm: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setPending(true);
    const message = await onConfirm(password);
    setPending(false);
    if (message) setError(message);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <PasswordField value={password} error={error} onChange={(v) => {
            setPassword(v);
            setError(undefined);
          }} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id="two-factor-password" label="Password" error={error}>
      <Input
        id="two-factor-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? 'two-factor-password-error' : undefined}
      />
    </Field>
  );
}

function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

const groupSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

function EnableDialog({ onClose }: { onClose: (done: boolean) => void }) {
  const [step, setStep] = useState<'password' | 'verify' | 'codes'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(
    null,
  );

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setPending(true);
    const { data, error: apiError } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (apiError || !data) {
      setError(errorMessage(apiError));
      return;
    }
    setSetup({
      uri: data.totpURI,
      secret: secretFromUri(data.totpURI),
      backupCodes: data.backupCodes,
    });
    setPassword('');
    setStep('verify');
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) {
      setError('Enter the 6-digit code from your app.');
      return;
    }
    setPending(true);
    const { error: apiError } = await authClient.twoFactor.verifyTotp({ code: digits });
    setPending(false);
    if (apiError) {
      setError(apiError.status === 429 ? errorMessage(apiError) : 'That code didn’t match. Check the time on your phone and try the next code.');
      return;
    }
    toast.success('Two-factor authentication enabled');
    setStep('codes');
  }

  const done = step === 'codes';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(done)}>
      <DialogContent>
        {step === 'password' && (
          <form onSubmit={submitPassword} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Enable two-factor authentication</DialogTitle>
              <DialogDescription>Confirm your password to continue.</DialogDescription>
            </DialogHeader>
            <PasswordField
              value={password}
              error={error}
              onChange={(v) => {
                setPassword(v);
                setError(undefined);
              }}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Continue
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'verify' && setup && (
          <form onSubmit={submitCode} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Add to your authenticator app</DialogTitle>
              <DialogDescription>
                In your app, add an account with a setup key (time-based), then enter the code it
                shows.{' '}
                <a href={setup.uri} className="underline underline-offset-4">
                  Open in authenticator app
                </a>{' '}
                on this device.
              </DialogDescription>
            </DialogHeader>
            <Field id="two-factor-secret" label="Setup key">
              <CopyField id="two-factor-secret" value={groupSecret(setup.secret)} label="Setup key" />
            </Field>
            <Field id="two-factor-uri" label="Setup link (otpauth)">
              <CopyField id="two-factor-uri" value={setup.uri} label="Setup link" />
            </Field>
            <Field id="two-factor-code" label="6-digit code" error={error}>
              <Input
                id="two-factor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                autoFocus
                placeholder="123456"
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/[^\d ]/g, ''));
                  setError(undefined);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? 'two-factor-code-error' : undefined}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Verify and enable
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'codes' && setup && (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Save your backup codes</DialogTitle>
              <DialogDescription>
                If you lose your phone, each code signs you in once. This is the only time they’re
                shown — store them in your password manager.
              </DialogDescription>
            </DialogHeader>
            <BackupCodes codes={setup.backupCodes} />
            <DialogFooter>
              <Button onClick={() => onClose(true)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({ onClose }: { onClose: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New backup codes</DialogTitle>
            <DialogDescription>
              Your old codes no longer work. This is the only time these are shown.
            </DialogDescription>
          </DialogHeader>
          <BackupCodes codes={codes} />
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <PasswordDialog
      title="Regenerate backup codes?"
      description="Your current backup codes stop working immediately."
      confirmLabel="Regenerate"
      onClose={onClose}
      onConfirm={async (password) => {
        const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
        if (error || !data) return errorMessage(error);
        setCodes(data.backupCodes);
        return null;
      }}
    />
  );
}
