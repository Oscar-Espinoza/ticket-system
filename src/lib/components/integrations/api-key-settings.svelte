<script lang="ts">
  import { m } from '@/lib/i18n';
  import { DATE_MEDIUM_LOCAL_FORMAT } from '@/lib/format';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { revokeApiKey, type ApiKeyView } from '@/lib/actions/api-keys';
  import { relativeTime } from '@/lib/relative-time';
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
      toast.success(m.settings_int_api_key_revoked_toast());
    } else toast.error(result.error);
  }
</script>

{#snippet createButton()}
  <Button size="sm" onclick={() => (creating = true)}>
    <PlusIcon />
    {m.settings_int_create_key()}
  </Button>
{/snippet}

<div class="flex flex-col gap-4">
  {#if keys.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-10"
      title={m.settings_int_no_api_keys()}
      description={m.settings_int_no_api_keys_hint()}
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
            <TableHead>{m.common_name()}</TableHead>
            <TableHead>{m.settings_int_col_key()}</TableHead>
            <TableHead>{m.settings_int_col_created()}</TableHead>
            <TableHead>{m.settings_int_col_last_used()}</TableHead>
            <TableHead class="w-0">
              <span class="sr-only">{m.settings_int_col_actions()}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each keys as key (key.id)}
            <TableRow>
              <TableCell class="max-w-48 truncate font-medium">{key.name}</TableCell>
              <TableCell class="font-mono text-xs text-muted-foreground">{key.prefix}…</TableCell>
              <TableCell class="text-muted-foreground">
                {DATE_MEDIUM_LOCAL_FORMAT.format(new Date(key.createdAt))}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {key.lastUsedAt ? relativeTime(new Date(key.lastUsedAt)) : m.settings_int_never()}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-destructive hover:text-destructive"
                  onclick={() => (revoking = key)}
                >
                  {m.settings_int_revoke()}
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
        <DialogTitle>{m.settings_int_copy_key_title()}</DialogTitle>
        <DialogDescription>
          {m.settings_int_copy_key_desc()}
        </DialogDescription>
      </DialogHeader>
      {#if created}
        <CopyField value={created} label={m.settings_int_api_key_label()} />
      {/if}
      <DialogFooter>
        <Button onclick={() => (created = null)}>{m.common_done()}</Button>
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
        <AlertDialogTitle>{m.settings_int_revoke_title({ name: revoking?.name ?? '' })}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.settings_int_revoke_desc()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            if (revoking) void revoke(revoking);
          }}
        >
          {m.settings_int_revoke()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
