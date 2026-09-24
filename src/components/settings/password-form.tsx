'use client';

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from './field';

const MIN_LENGTH = 8; // Keep in sync with emailAndPassword.minPasswordLength.

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirm = String(data.get('confirmPassword') ?? '');

    const nextErrors: typeof errors = {};
    if (!currentPassword) nextErrors.current = 'Enter your current password.';
    if (newPassword.length < MIN_LENGTH) {
      nextErrors.next = `Use at least ${MIN_LENGTH} characters.`;
    }
    if (confirm !== newPassword) nextErrors.confirm = "Passwords don't match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    // Better Auth verifies the current password server-side; revoking other
    // sessions signs out any device that might know the old one.
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (error) {
      if (error.code === 'INVALID_PASSWORD') {
        setErrors({ current: 'Current password is incorrect.' });
      } else {
        toast.error(error.message ?? 'Could not change your password.');
      }
      return;
    }
    formRef.current?.reset();
    toast.success('Password changed. Other sessions were signed out.');
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-4 flex flex-col gap-5" noValidate>
      <Field id="current-password" label="Current password" error={errors.current}>
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.current}
        />
      </Field>
      <Field
        id="new-password"
        label="New password"
        hint={`At least ${MIN_LENGTH} characters.`}
        error={errors.next}
      >
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.next}
        />
      </Field>
      <Field id="confirm-password" label="Confirm new password" error={errors.confirm}>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
        />
      </Field>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Change password
        </Button>
      </div>
    </form>
  );
}
