<!-- Settings → Automations: auto-archive and auto-close periods. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { updateAutomationSettings } from '@/lib/actions/planning-settings';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { relativeTime } from '@/lib/relative-time';
  import { AUTOMATION_MONTHS } from '@/lib/cycle-utils';

  const OFF = 'off';

  interface AutomationSettings {
    autoArchiveMonths: number | null;
    autoCloseMonths: number | null;
  }

  let {
    projectId,
    initial,
    lastRunAt,
    canEdit,
  }: {
    projectId: string;
    initial: AutomationSettings;
    lastRunAt: Date | null;
    canEdit: boolean;
  } = $props();

  // useState(initial): seeded once.
  let values = $state<AutomationSettings>(untrack(() => ({ ...initial })));
  let saved = $state<AutomationSettings>(untrack(() => ({ ...initial })));
  let pending = $state(false);
  const dirty = $derived(
    values.autoArchiveMonths !== saved.autoArchiveMonths ||
      values.autoCloseMonths !== saved.autoCloseMonths,
  );

  const monthItems = [
    { value: OFF, label: 'Off' },
    ...AUTOMATION_MONTHS.map((months) => ({
      value: String(months),
      label: `After ${months} ${months === 1 ? 'month' : 'months'}`,
    })),
  ];

  async function save(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    try {
      const snapshot = { ...values };
      const result = await updateAutomationSettings({ projectId, ...snapshot });
      if (!result.ok) {
        toast.error(result.error === 'Forbidden' ? 'Only admins can change these settings.' : result.error);
        return;
      }
      saved = snapshot;
      toast.success('Automations saved');
    } finally {
      pending = false;
    }
  }
</script>

{#snippet monthsSelect(id: string, key: keyof AutomationSettings)}
  <Select
    items={monthItems}
    value={values[key] === null ? OFF : String(values[key])}
    onValueChange={(v: string) => (values[key] = v === OFF ? null : Number(v))}
    disabled={!canEdit || pending}
  >
    <SelectTrigger {id} class="w-full max-w-xs">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {#each monthItems as item (item.value)}
        <SelectItem value={item.value}>{item.label}</SelectItem>
      {/each}
    </SelectContent>
  </Select>
{/snippet}

<form onsubmit={save} class="flex flex-col gap-6">
  {#if !canEdit}
    <p class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Only project owners and admins can change these settings.
    </p>
  {/if}
  <Field
    id="auto-archive"
    label="Auto-archive closed issues"
    hint="Completed and canceled issues are archived once they have been closed this long. Archived issues stay searchable and can be restored."
  >
    {@render monthsSelect('auto-archive', 'autoArchiveMonths')}
  </Field>
  <Field
    id="auto-close"
    label="Auto-close stale issues"
    hint="Triage, backlog and unstarted issues that haven't been updated for this long move to Canceled, with a note in their activity."
  >
    {@render monthsSelect('auto-close', 'autoCloseMonths')}
  </Field>
  <p class="text-xs text-muted-foreground">
    Issues in the trash are permanently deleted after 30 days.{#if lastRunAt}<span>{' '}Last run {relativeTime(lastRunAt)}.</span>{/if}
  </p>
  {#if canEdit}
    <div>
      <Button type="submit" disabled={pending || !dirty}>
        {#if pending}<LoaderCircle class="animate-spin" />{/if}
        Save changes
      </Button>
    </div>
  {/if}
</form>
