<script lang="ts">
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
        Disconnect
      </Button>
    {/snippet}
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
      <AlertDialogDescription>{description}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={onConfirm}>Disconnect</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
