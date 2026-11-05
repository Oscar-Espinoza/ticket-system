<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { authClient } from '@/lib/svelte/auth-client';
  import Field from './field.svelte';

  const MIN_LENGTH = 8; // Keep in sync with emailAndPassword.minPasswordLength.

  let formEl = $state<HTMLFormElement>();
  let pending = $state(false);
  let errors = $state<{ current?: string; next?: string; confirm?: string }>({});

  async function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
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
    errors = nextErrors;
    if (Object.keys(nextErrors).length > 0) return;

    pending = true;
    // Better Auth verifies the current password server-side; revoking other
    // sessions signs out any device that might know the old one.
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    pending = false;

    if (error) {
      if (error.code === 'INVALID_PASSWORD') {
        errors = { current: 'Current password is incorrect.' };
      } else {
        toast.error(error.message ?? 'Could not change your password.');
      }
      return;
    }
    formEl?.reset();
    toast.success('Password changed. Other sessions were signed out.');
  }
</script>

<form bind:this={formEl} {onsubmit} class="mt-4 flex flex-col gap-5" novalidate>
  <Field id="current-password" label="Current password" error={errors.current}>
    <Input
      id="current-password"
      name="currentPassword"
      type="password"
      autocomplete="current-password"
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
      autocomplete="new-password"
      aria-invalid={!!errors.next}
    />
  </Field>
  <Field id="confirm-password" label="Confirm new password" error={errors.confirm}>
    <Input
      id="confirm-password"
      name="confirmPassword"
      type="password"
      autocomplete="new-password"
      aria-invalid={!!errors.confirm}
    />
  </Field>
  <div>
    <Button type="submit" variant="outline" disabled={pending}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      Change password
    </Button>
  </div>
</form>
