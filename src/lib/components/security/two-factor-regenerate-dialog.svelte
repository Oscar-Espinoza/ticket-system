<!--
  Regenerate backup codes: password first, then the new codes (RegenerateDialog
  in two-factor-settings.tsx). Mounted only while open.
-->
<script lang="ts">
  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import BackupCodes from './backup-codes.svelte';
  import PasswordDialog from './two-factor-password-dialog.svelte';
  import { errorMessage } from './two-factor-errors';

  let { onClose }: { onClose: () => void } = $props();

  let codes = $state<string[] | null>(null);
</script>

{#if codes}
  <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New backup codes</DialogTitle>
        <DialogDescription>
          Your old codes no longer work. This is the only time these are shown.
        </DialogDescription>
      </DialogHeader>
      <BackupCodes {codes} />
      <DialogFooter>
        <Button onclick={onClose}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{:else}
  <PasswordDialog
    title="Regenerate backup codes?"
    description="Your current backup codes stop working immediately."
    confirmLabel="Regenerate"
    {onClose}
    onConfirm={async (password) => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error || !data) return errorMessage(error);
      codes = data.backupCodes;
      return null;
    }}
  />
{/if}
