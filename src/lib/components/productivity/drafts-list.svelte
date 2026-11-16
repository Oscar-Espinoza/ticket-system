<script module lang="ts">
  import { m } from '@/lib/i18n';
  export interface DraftListItem {
    id: string;
    title: string;
    description: string | null;
    updatedAt: Date;
    projectId: string;
    projectName: string;
    ticketKey: string;
  }
</script>

<script lang="ts">
  import FilePen from '@lucide/svelte/icons/file-pen';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { deleteDraft, discardAllDrafts } from '@/lib/actions/drafts';
  import { projectHref } from '@/lib/components/app-shell/routes';
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
    AlertDialogTrigger,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { DRAFT_PARAM } from './new-issue-bus.svelte';

  type Op = { type: 'delete'; id: string } | { type: 'clear' };

  let { drafts }: { drafts: DraftListItem[] } = $props();

  // Optimistic: ops stay applied over `drafts` while any call is running
  // (they clear together once every call has settled — by then
  // the action's refresh has delivered the new server list).
  let ops = $state.raw<Op[]>([]);
  let running = 0;
  const list = $derived(
    ops.reduce<DraftListItem[]>(
      (current, op) => (op.type === 'clear' ? [] : current.filter((d) => d.id !== op.id)),
      drafts,
    ),
  );

  async function optimistic(op: Op, task: () => Promise<void>) {
    running += 1;
    ops = [...ops, op];
    try {
      await task();
    } finally {
      running -= 1;
      if (running === 0) ops = [];
    }
  }

  const remove = (id: string) =>
    optimistic({ type: 'delete', id }, async () => {
      const result = await deleteDraft({ id }).catch(() => null);
      if (!result?.ok) toast.error(m.issues_drafts_delete_failed());
    });

  const clear = () =>
    optimistic({ type: 'clear' }, async () => {
      const result = await discardAllDrafts().catch(() => null);
      if (!result?.ok) toast.error(m.issues_drafts_discard_failed());
      else toast.success(m.issues_drafts_discarded());
    });
</script>

{#snippet filePenIcon()}<FilePen />{/snippet}

<div class="flex flex-col">
  <div class="mb-3 flex items-center gap-2">
    <h1 class="text-xl font-medium">{m.issues_drafts()}</h1>
    {#if list.length > 0}
      <span class="text-sm tabular-nums text-muted-foreground">{list.length}</span>
    {/if}
    {#if list.length > 0}
      <AlertDialog>
        <AlertDialogTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="sm" class="ml-auto text-muted-foreground">
              {m.issues_drafts_discard_all()}
            </Button>
          {/snippet}
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.issues_drafts_discard_all_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {list.length === 1 ? m.issues_drafts_deleted_one() : m.issues_drafts_deleted_many({ count: list.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onclick={() => void clear()}>
              {m.issues_drafts_discard_all()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    {/if}
  </div>

  {#if list.length === 0}
    <EmptyState
      icon={filePenIcon}
      title={m.issues_drafts_empty()}
      description={m.issues_drafts_empty_description()}
    />
  {:else}
    <ul class="flex flex-col gap-px">
      {#each list as draft (draft.id)}
        <li class="group relative">
          <a
            href="{projectHref(draft.projectId)}?{DRAFT_PARAM}={encodeURIComponent(draft.id)}"
            class="flex h-11 items-center gap-3 rounded-md px-3 pr-12 text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FilePen class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 items-baseline gap-2">
              <span class={draft.title.trim() ? 'truncate' : 'truncate italic text-muted-foreground'}>
                {draft.title.trim() || m.issues_drafts_untitled()}
              </span>
              {#if draft.description}
                <span class="hidden truncate text-xs text-muted-foreground sm:inline">
                  {draft.description.slice(0, 160)}
                </span>
              {/if}
            </span>
            <span class="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
              <span class="rounded bg-muted px-1.5 py-0.5 font-mono">{draft.ticketKey}</span>
              <span class="max-w-40 truncate">{draft.projectName}</span>
            </span>
            <time
              datetime={new Date(draft.updatedAt).toISOString()}
              class="w-20 shrink-0 text-right text-xs text-muted-foreground"
            >
              {relativeTime(draft.updatedAt)}
            </time>
          </a>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={m.issues_drafts_delete_named({ title: draft.title.trim() || m.issues_drafts_untitled() })}
            onclick={() => void remove(draft.id)}
            class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
