<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { changeProjectKey, type ProjectSettingsState } from '@/lib/actions/project-settings';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { createActionState, useResultToast } from './action-state.svelte';
  import Field from './field.svelte';
  import type { ProjectGeneralFormProps } from './project-general-types';

  let { projectId, ticketKey, isOwner }: ProjectGeneralFormProps = $props();

  const form = createActionState<ProjectSettingsState>(changeProjectKey, {});
  useResultToast(() => form.state, m.settings_project_key_changed_toast());
  // Seeded once; the refreshed prop equals the typed value after a successful change.
  let value = $state(untrack(() => ticketKey));
  const error = $derived(form.state.errors?.ticketKey);
  const changed = $derived(value !== ticketKey);
  const descParts = $derived(m.settings_project_key_desc({ example: '\u0000' }).split('\u0000'));
  const warnParts = $derived(
    m.settings_project_key_warning({ from: '\u0000', to: '\u0001' }).split(/[\u0000\u0001]/),
  );
</script>

<form onsubmit={form.onsubmit} class="flex flex-col gap-4" novalidate>
  <input type="hidden" name="projectId" value={projectId} />
  <div>
    <h2 class="text-base font-medium">{m.settings_project_key_title()}</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      {descParts[0]}<span class="font-mono">{ticketKey}-12</span>{descParts[1]}
    </p>
  </div>
  <Field id="project-key" label={m.settings_project_key_label()} hint={isOwner ? m.settings_project_key_hint() : m.settings_project_key_owner_only()}
    {error}>
    <Input
      id="project-key"
      name="ticketKey"
      {value}
      oninput={(e) => {
        // Write the cleaned key back to the field even when it equals the old
        // value (typing "1" after "WEB" must not leave "WEB1" on screen).
        value = e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
        e.currentTarget.value = value;
      }}
      disabled={!isOwner}
      autocomplete="off"
      spellcheck={false}
      class="max-w-32 font-mono"
      aria-invalid={!!error}
      aria-describedby={error ? 'project-key-error' : undefined}
    />
  </Field>
  {#if isOwner && changed}
    <p class="flex items-start gap-2 text-sm text-muted-foreground">
      <TriangleAlertIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-amber-500" />
      <span>
        {warnParts[0]}<span class="font-mono">{ticketKey}-…</span>{warnParts[1]}<span class="font-mono">{value || '…'}-…</span>{warnParts[2]}
      </span>
    </p>
  {/if}
  {#if isOwner}
    <div>
      <Button type="submit" variant="outline" disabled={form.pending || !changed}>
        {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
        {m.settings_project_change_key()}
      </Button>
    </div>
  {/if}
</form>
