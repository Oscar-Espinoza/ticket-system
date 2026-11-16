<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import UnplugIcon from '@lucide/svelte/icons/unplug';

  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';

  let {
    name,
    description,
    disabled,
    pending,
    onConfirm,
  }: {
    name: string;
    description: string;
    disabled: boolean;
    pending: boolean;
    onConfirm: () => void;
  } = $props();
</script>

<AlertDialog>
  <AlertDialogTrigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="sm" {disabled}>
        {#if pending}<Loader2Icon class="animate-spin" />{:else}<UnplugIcon />{/if}
        {m.settings_dev_disconnect()}
      </Button>
    {/snippet}
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{m.settings_dev_disconnect_title({ name })}</AlertDialogTitle>
      <AlertDialogDescription>{description}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={onConfirm}>{m.settings_dev_disconnect()}</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
