<!--
  Password confirmation dialog (PasswordDialog in two-factor-settings.tsx),
  used to disable 2FA and to regenerate backup codes. Mounted only while open.
-->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import PasswordField from './two-factor-password-field.svelte';

  let {
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
  } = $props();

  let password = $state('');
  let error = $state<string>();
  let pending = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!password) {
      error = 'Enter your password.';
      return;
    }
    pending = true;
    const message = await onConfirm(password);
    pending = false;
    if (message) error = message;
  }
</script>

<Dialog open onOpenChange={(open) => !open && onClose()}>
  <DialogContent>
    <form onsubmit={submit} novalidate class="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <PasswordField
        value={password}
        {error}
        onChange={(v) => {
          password = v;
          error = undefined;
        }}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
        <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
          {#if pending}<Loader2Icon class="animate-spin" />{/if}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
