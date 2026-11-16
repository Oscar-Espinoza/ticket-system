<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { MIN_PASSWORD_LENGTH } from '@/lib/auth-rules';
  import { authClient } from '@/lib/svelte/auth-client';
  import Field from './field.svelte';

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
    if (!currentPassword) nextErrors.current = m.settings_password_enter_current();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.next = m.settings_password_min({ min: MIN_PASSWORD_LENGTH });
    }
    if (confirm !== newPassword) nextErrors.confirm = m.settings_password_mismatch();
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
        errors = { current: m.settings_password_incorrect() };
      } else {
        toast.error(error.message ?? m.settings_password_change_failed());
      }
      return;
    }
    formEl?.reset();
    toast.success(m.settings_password_changed_toast());
  }
</script>

<form bind:this={formEl} {onsubmit} class="mt-4 flex flex-col gap-5" novalidate>
  <Field id="current-password" label={m.settings_password_current()} error={errors.current}>
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
    label={m.settings_password_new()}
    hint={m.settings_password_hint({ min: MIN_PASSWORD_LENGTH })}
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
  <Field id="confirm-password" label={m.settings_password_confirm()} error={errors.confirm}>
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
      {m.settings_password_change()}
    </Button>
  </div>
</form>
