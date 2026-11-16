<!-- Settings → Automations: auto-archive and auto-close periods. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
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
    { value: OFF, label: m.projects_automations_off() },
    ...AUTOMATION_MONTHS.map((months) => ({
      value: String(months),
      label: m.projects_automations_after_months({ count: months }),
    })),
  ];

  async function save(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    try {
      const snapshot = { ...values };
      const result = await updateAutomationSettings({ projectId, ...snapshot });
      if (!result.ok) {
        toast.error(actionErrorText(result.error, m.projects_automations_admins_only()));
        return;
      }
      saved = snapshot;
      toast.success(m.projects_automations_saved());
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
      {m.projects_settings_owners_admins_only()}
    </p>
  {/if}
  <Field
    id="auto-archive"
    label={m.projects_auto_archive_label()}
    hint={m.projects_auto_archive_hint()}
  >
    {@render monthsSelect('auto-archive', 'autoArchiveMonths')}
  </Field>
  <Field
    id="auto-close"
    label={m.projects_auto_close_label()}
    hint={m.projects_auto_close_hint()}
  >
    {@render monthsSelect('auto-close', 'autoCloseMonths')}
  </Field>
  <p class="text-xs text-muted-foreground">
    {m.projects_trash_purge()}{#if lastRunAt}<span>{' '}{m.projects_last_run({ time: relativeTime(lastRunAt) })}</span>{/if}
  </p>
  {#if canEdit}
    <div>
      <Button type="submit" disabled={pending || !dirty}>
        {#if pending}<LoaderCircle class="animate-spin" />{/if}
        {m.common_save_changes()}
      </Button>
    </div>
  {/if}
</form>
