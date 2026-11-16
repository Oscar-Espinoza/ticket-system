<!--
  Settings → Recurring issues: the project's schedules, and the editor dialog
  (title, description, cadence, default properties, due offset) with a preview
  of the next runs.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { goto } from '$app/navigation';
  import Plus from '@lucide/svelte/icons/plus';
  import Repeat from '@lucide/svelte/icons/repeat';
  import { toast } from 'svelte-sonner';

  import {
    deleteRecurringIssue,
    runRecurringIssueNow,
    setRecurringIssueEnabled,
  } from '@/lib/actions/recurring';
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
  import { EmptyState } from '@/lib/components/ui-icons';
  import { issuePath } from '@/lib/issue-links';
  import type { RecurringIssue } from '@/lib/recurring-schedule';
  import RecurringEditor from './recurring-editor.svelte';
  import RecurringRow from './recurring-row.svelte';

  let {
    projectId,
    items,
    canEdit,
    cronConfigured,
  }: {
    projectId: string;
    items: RecurringIssue[];
    /** Members and up; guests see the list read-only. */
    canEdit: boolean;
    /** CRON_SECRET is set, so the daily job runs. */
    cronConfigured: boolean;
  } = $props();

  let editing = $state<RecurringIssue | 'new' | null>(null);
  let deleting = $state<RecurringIssue | null>(null);

  async function act(run: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    const result = await run();
    if (!result.ok) toast.error(result.error ?? m.projects_something_went_wrong());
    else if (success) toast.success(success);
  }

  async function runNow(item: RecurringIssue) {
    const result = await runRecurringIssueNow({ projectId, id: item.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(m.projects_recurring_created_key({ key: result.key }), {
      action: { label: m.projects_open(), onClick: () => void goto(issuePath(projectId, result.key)) },
    });
  }

  const editorKey = $derived(editing === 'new' ? 'new' : (editing?.id ?? 'closed'));
</script>

{#snippet newButton()}
  <Button size="sm" onclick={() => (editing = 'new')}>
    <Plus />
    {m.projects_recurring_new()}
  </Button>
{/snippet}

{#snippet repeatIcon()}<Repeat />{/snippet}

<div class="flex flex-col gap-4">
  {#if !cronConfigured}
    <p class="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {#each m
        .projects_recurring_cron({ secret: '\u0001', path: '\u0002' })
        .split(/([\u0001\u0002])/) as part, i (i)}
        {#if part === '\u0001'}<code class="font-mono">{'CRON_SECRET'}</code>{:else if part === '\u0002'}<code
            class="font-mono">{'/api/cron/daily'}</code
          >{:else}{part}{/if}
      {/each}
    </p>
  {/if}
  {#if canEdit && items.length > 0}
    <div>{@render newButton()}</div>
  {/if}

  {#if items.length === 0}
    <EmptyState
      icon={repeatIcon}
      title={m.projects_recurring_empty_title()}
      description={m.projects_recurring_empty_desc()}
      action={canEdit ? newButton : undefined}
    />
  {:else}
    <ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
      {#each items as item (item.id)}
        <RecurringRow
          {item}
          {canEdit}
          onEdit={() => (editing = item)}
          onRun={() => void runNow(item)}
          onToggle={() =>
            void act(
              () => setRecurringIssueEnabled({ projectId, id: item.id, enabled: !item.enabled }),
              item.enabled ? m.projects_recurring_paused() : m.projects_recurring_resumed(),
            )}
          onDelete={() => (deleting = item)}
        />
      {/each}
    </ul>
  {/if}

  {#key editorKey}
    <RecurringEditor
      {projectId}
      item={editing === 'new' ? null : editing}
      open={editing !== null}
      onClose={() => (editing = null)}
    />
  {/key}

  <AlertDialog bind:open={() => deleting !== null, (open) => !open && (deleting = null)}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>{m.projects_recurring_delete_title({ title: deleting?.title ?? '' })}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.projects_recurring_delete_desc()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            const item = deleting;
            deleting = null;
            if (item) {
              void act(() => deleteRecurringIssue({ projectId, id: item.id }), m.projects_recurring_deleted());
            }
          }}
        >
          {m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
