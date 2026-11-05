<script lang="ts">
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { revokeApiKey, type ApiKeyView } from '@/lib/actions/api-keys';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
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
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/lib/components/ui/table';
  import { EmptyState } from '@/lib/components/ui-icons';
  import CopyField from './copy-field.svelte';
  import CreateKeyDialog from './create-key-dialog.svelte';

  let { keys: initial }: { keys: ApiKeyView[] } = $props();

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  // svelte-ignore state_referenced_locally
  let keys = $state.raw(initial);
  let creating = $state(false);
  let created = $state<string | null>(null);
  let revoking = $state<ApiKeyView | null>(null);

  async function revoke(key: ApiKeyView) {
    const result = await revokeApiKey({ id: key.id });
    if (!result) return;
    if (result.ok) {
      keys = keys.filter((k) => k.id !== key.id);
      toast.success('API key revoked');
    } else toast.error(result.error);
  }
</script>

{#snippet createButton()}
  <Button size="sm" onclick={() => (creating = true)}>
    <PlusIcon />
    Create key
  </Button>
{/snippet}

<div class="flex flex-col gap-4">
  {#if keys.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-10"
      title="No API keys"
      description="Create a key to script issues from CI, bots or your own tools."
      action={createButton}
    >
      {#snippet icon()}<KeyRoundIcon />{/snippet}
    </EmptyState>
  {:else}
    <div class="flex justify-end">{@render createButton()}</div>
    <div class="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead class="w-0">
              <span class="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each keys as key (key.id)}
            <TableRow>
              <TableCell class="max-w-48 truncate font-medium">{key.name}</TableCell>
              <TableCell class="font-mono text-xs text-muted-foreground">{key.prefix}…</TableCell>
              <TableCell class="text-muted-foreground">
                {dateFormat.format(new Date(key.createdAt))}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {key.lastUsedAt ? relativeTime(new Date(key.lastUsedAt)) : 'Never'}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-destructive hover:text-destructive"
                  onclick={() => (revoking = key)}
                >
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {/if}

  {#if creating}
    <CreateKeyDialog
      onClose={() => (creating = false)}
      onCreated={(apiKey, key) => {
        keys = [apiKey, ...keys];
        creating = false;
        created = key;
      }}
    />
  {/if}

  <Dialog
    bind:open={() => !!created, (open) => {
      if (!open) created = null;
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Copy your API key</DialogTitle>
        <DialogDescription>
          This is the only time the key is shown. Store it somewhere safe — anyone with it can act as
          you in every project you belong to.
        </DialogDescription>
      </DialogHeader>
      {#if created}
        <CopyField value={created} label="API key" />
      {/if}
      <DialogFooter>
        <Button onclick={() => (created = null)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog
    bind:open={() => !!revoking, (open) => {
      if (!open) revoking = null;
    }}
  >
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          Requests using this key will fail immediately. This can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            if (revoking) void revoke(revoking);
          }}
        >
          Revoke
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
