<!--
  Settings → SLAs: a response target per priority (empty = no SLA) and a way
  to re-apply the saved policy to issues that are already open.
-->
<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { applySlaPolicyToOpenIssues, updateSlaPolicy } from '@/lib/actions/sla';
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
  import { Input } from '@/lib/components/ui/input';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Separator } from '@/lib/components/ui/separator';
  import { PriorityIcon } from '@/lib/components/ui-icons';
  import { PRIORITY_LABEL } from '@/lib/issue-model';
  import { SLA_MAX_HOURS, SLA_PRIORITIES, type SlaPolicy, type SlaPriority } from '@/lib/sla';

  type Unit = 'hours' | 'days';
  type Row = { amount: string; unit: Unit };
  type Rows = Record<SlaPriority, Row>;

  let { projectId, initial, canEdit }: { projectId: string; initial: SlaPolicy; canEdit: boolean } = $props();

  const UNIT_ITEMS = [
    { value: 'hours', label: 'hours' },
    { value: 'days', label: 'days' },
  ];

  function toRows(policy: SlaPolicy): Rows {
    const rows = {} as Rows;
    for (const priority of SLA_PRIORITIES) {
      const hours = policy[priority];
      rows[priority] =
        hours === undefined
          ? { amount: '', unit: 'hours' }
          : hours % 24 === 0
            ? { amount: String(hours / 24), unit: 'days' }
            : { amount: String(hours), unit: 'hours' };
    }
    return rows;
  }

  /** Rows → policy, or the first problem. */
  function toPolicy(rows: Rows): { policy: SlaPolicy } | { error: string } {
    const policy: SlaPolicy = {};
    for (const priority of SLA_PRIORITIES) {
      const { amount, unit } = rows[priority];
      if (!amount.trim()) continue;
      const value = Number(amount);
      const hours = unit === 'days' ? value * 24 : value;
      if (!Number.isInteger(value) || hours < 1 || hours > SLA_MAX_HOURS) {
        return {
          error: `${PRIORITY_LABEL[priority]}: enter a whole number of ${unit} (up to 365 days).`,
        };
      }
      policy[priority] = hours;
    }
    return { policy };
  }

  const samePolicy = (a: SlaPolicy, b: SlaPolicy) => SLA_PRIORITIES.every((priority) => a[priority] === b[priority]);

  // useState initializers: seeded once from `initial`.
  let rows = $state.raw<Rows>(untrack(() => toRows(initial)));
  let saved = $state.raw<SlaPolicy>(untrack(() => initial));
  let confirming = $state(false);
  let pending = $state(false);

  const parsed = $derived(toPolicy(rows));
  const dirty = $derived('policy' in parsed ? !samePolicy(parsed.policy, saved) : true);
  const disabled = $derived(!canEdit || pending);
  const hasTargets = $derived(SLA_PRIORITIES.some((p) => saved[p] !== undefined));

  const set = (priority: SlaPriority, patch: Partial<Row>) => {
    rows = { ...rows, [priority]: { ...rows[priority], ...patch } };
  };

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const current = parsed;
    if ('error' in current) {
      toast.error(current.error);
      return;
    }
    pending = true;
    try {
      const result = await updateSlaPolicy({ projectId, policy: current.policy });
      if (!result.ok) {
        toast.error(actionErrorText(result.error, 'Only admins can change SLAs.'));
        return;
      }
      saved = result.policy;
      toast.success('SLAs saved');
    } finally {
      pending = false;
    }
  }

  async function apply() {
    pending = true;
    try {
      const result = await applySlaPolicyToOpenIssues({ projectId });
      if (!result.ok) {
        toast.error(actionErrorText(result.error, 'Only admins can change SLAs.'));
        return;
      }
      toast.success(`Updated ${result.updated} open ${result.updated === 1 ? 'issue' : 'issues'}`);
    } finally {
      pending = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  {#if !canEdit}
    <p class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Only project owners and admins can change SLAs.
    </p>
  {/if}

  <form onsubmit={save} class="flex flex-col gap-5">
    <fieldset {disabled} class="flex flex-col gap-1">
      <legend class="mb-2 text-sm font-medium">Targets by priority</legend>
      <ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
        {#each SLA_PRIORITIES as priority (priority)}
          {@const id = `sla-${priority}`}
          <li class="flex items-center gap-3 px-3 py-2">
            <PriorityIcon {priority} size={14} />
            <label for={id} class="flex-1 text-sm">
              {PRIORITY_LABEL[priority]}
            </label>
            <Input
              {id}
              type="number"
              inputmode="numeric"
              min={1}
              step={1}
              placeholder="No SLA"
              value={rows[priority].amount}
              oninput={(e) => set(priority, { amount: e.currentTarget.value })}
              class="h-8 w-24 tabular-nums"
            />
            <Select
              value={rows[priority].unit}
              onValueChange={(unit: string) => set(priority, { unit: unit as Unit })}
              {disabled}
              items={UNIT_ITEMS}
            >
              <SelectTrigger class="w-24" aria-label={`${PRIORITY_LABEL[priority]} SLA unit`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">hours</SelectItem>
                <SelectItem value="days">days</SelectItem>
              </SelectContent>
            </Select>
          </li>
        {/each}
      </ul>
      <p class="mt-1 text-xs text-muted-foreground">
        The clock starts when an issue is created and restarts when its priority changes.
        Completing or canceling the issue stops it. Leave a priority empty for no SLA.
      </p>
    </fieldset>
    {#if canEdit}
      <div>
        <Button type="submit" disabled={pending || !dirty}>
          {#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
          Save changes
        </Button>
      </div>
    {/if}
  </form>

  {#if canEdit}
    <Separator />
    <section class="flex items-start justify-between gap-6">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-sm font-medium">Apply to open issues</h2>
        <p class="text-xs text-muted-foreground">
          New targets only affect new issues and priority changes. Recompute the deadline of
          every open issue from its creation time — issues already past it are marked
          breached without notifying anyone.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || dirty}
        title={dirty ? 'Save your changes first' : undefined}
        onclick={() => (confirming = true)}
      >
        Apply…
      </Button>
    </section>
  {/if}

  <AlertDialog open={confirming} onOpenChange={(open: boolean) => (confirming = open)}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Apply SLAs to open issues?</AlertDialogTitle>
        <AlertDialogDescription>
          {hasTargets
            ? 'Every open issue gets a deadline from its priority and creation time. Issues whose priority has no target lose their SLA.'
            : 'No targets are set, so every open issue loses its SLA.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onclick={() => {
            confirming = false;
            void apply();
          }}
        >
          Apply
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
