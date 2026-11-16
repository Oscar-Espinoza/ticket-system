<!--
  Regenerate backup codes: password first, then the new codes. Mounted only while open.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
        <DialogTitle>{m.settings_sec_new_codes()}</DialogTitle>
        <DialogDescription>
          {m.settings_sec_new_codes_desc()}
        </DialogDescription>
      </DialogHeader>
      <BackupCodes {codes} />
      <DialogFooter>
        <Button onclick={onClose}>{m.common_done()}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{:else}
  <PasswordDialog
    title={m.settings_sec_regen_title()}
    description={m.settings_sec_regen_desc()}
    confirmLabel={m.settings_sec_regenerate()}
    {onClose}
    onConfirm={async (password) => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error || !data) return errorMessage(error);
      codes = data.backupCodes;
      return null;
    }}
  />
{/if}
