<!--
  Workspace → Security → SCIM provisioning:
  one bearer token per workspace, shown once (stored hashed), rotate or revoke
  any time.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import UsersIcon from '@lucide/svelte/icons/users';
  import { toast } from 'svelte-sonner';

  // Both wrappers refresh the page data after they resolve (React's router.refresh()).
  import { generateScimToken, revokeScimToken } from '@/lib/actions/security';
  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { LabelChip } from '@/lib/components/ui-icons';
  import ScimNotes from './scim-notes.svelte';

  let {
    workspaceId,
    configured: initialConfigured,
    baseUrl,
  }: {
    workspaceId: string;
    configured: boolean;
    baseUrl: string;
  } = $props();

  let configured = $state(untrack(() => initialConfigured));
  let token = $state<string | null>(null);
  let confirm = $state<'rotate' | 'revoke' | null>(null);
  // useTransition: one pending flag for both actions.
  let running = $state(0);
  const pending = $derived(running > 0);

  async function transition(task: () => Promise<void>) {
    running++;
    try {
      await task();
    } finally {
      running--;
    }
  }

  function generate() {
    void transition(async () => {
      const result = await generateScimToken({ workspaceId });
      if (result.ok) {
        configured = true;
        token = result.token;
      } else toast.error(result.error);
    });
  }

  function revoke() {
    void transition(async () => {
      const result = await revokeScimToken({ workspaceId });
      if (result.ok) {
        configured = false;
        toast.success('SCIM token revoked');
      } else toast.error(result.error);
    });
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
    <span
      aria-hidden="true"
      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
    >
      <UsersIcon class="size-4" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="flex items-center gap-2 text-sm font-medium">
        SCIM 2.0
        {#if configured}<LabelChip color="done">Active</LabelChip>{:else}<LabelChip>Off</LabelChip>{/if}
      </p>
      <p class="mt-0.5 text-sm text-muted-foreground">
        Your identity provider adds people to the workspace when they’re assigned and removes them
        from the workspace and its teams when they’re deactivated.
      </p>
    </div>
    {#if configured}
      <Button variant="outline" size="sm" disabled={pending} onclick={() => (confirm = 'rotate')}>
        <RefreshCwIcon />
        Rotate token
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive"
        disabled={pending}
        onclick={() => (confirm = 'revoke')}
      >
        Revoke
      </Button>
    {:else}
      <Button size="sm" disabled={pending} onclick={generate}>
        {#if pending}<Loader2Icon class="animate-spin" />{/if}
        Generate token
      </Button>
    {/if}
  </div>

  <Field id="scim-base-url" label="SCIM base URL">
    <CopyField id="scim-base-url" value={baseUrl} label="Base URL" />
  </Field>

  <ScimNotes {baseUrl} />

  <Dialog open={!!token} onOpenChange={(open) => !open && (token = null)}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Copy your SCIM token</DialogTitle>
        <DialogDescription>
          This is the only time it’s shown. Paste it into your identity provider as the bearer token
          — anyone with it can add and remove workspace members.
        </DialogDescription>
      </DialogHeader>
      {#if token}<CopyField value={token} label="SCIM token" />{/if}
      <DialogFooter>
        <Button onclick={() => (token = null)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog open={!!confirm} onOpenChange={(open) => !open && (confirm = null)}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {confirm === 'rotate' ? 'Rotate the SCIM token?' : 'Revoke the SCIM token?'}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {confirm === 'rotate'
            ? 'The current token stops working immediately; update your identity provider with the new one.'
            : 'Provisioning stops immediately. Existing members stay in the workspace.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant={confirm === 'revoke' ? 'destructive' : 'default'}
          onclick={() => (confirm === 'rotate' ? generate() : revoke())}
        >
          {confirm === 'rotate' ? 'Rotate' : 'Revoke'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
