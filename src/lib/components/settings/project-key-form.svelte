<script lang="ts">
  import { untrack } from 'svelte';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { changeProjectKey, type ProjectSettingsState } from '@/lib/actions/project-settings';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { createActionState, useResultToast } from './action-state.svelte';
  import Field from './field.svelte';
  import type { ProjectGeneralFormProps } from './project-general-form.svelte';

  let { projectId, ticketKey, isOwner }: ProjectGeneralFormProps = $props();

  const form = createActionState<ProjectSettingsState>(changeProjectKey, {});
  useResultToast(() => form.state, 'Issue key changed');
  // Seeded once; the refreshed prop equals the typed value after a successful change.
  let value = $state(untrack(() => ticketKey));
  const error = $derived(form.state.errors?.ticketKey);
  const changed = $derived(value !== ticketKey);
</script>

<form onsubmit={form.onsubmit} class="flex flex-col gap-4" novalidate>
  <input type="hidden" name="projectId" value={projectId} />
  <div>
    <h2 class="text-base font-medium">Issue key</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      The prefix of every issue ID, like <span class="font-mono">{ticketKey}-12</span>.
    </p>
  </div>
  <Field id="project-key" label="Key" hint={isOwner ? '2–6 uppercase letters.' : 'Only the project owner can change the key.'}
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
        Every issue ID changes from <span class="font-mono">{ticketKey}-…</span> to{' '}
        <span class="font-mono">{value || '…'}-…</span>. Links, branch names and commit messages that
        use the old IDs will no longer match.
      </span>
    </p>
  {/if}
  {#if isOwner}
    <div>
      <Button type="submit" variant="outline" disabled={form.pending || !changed}>
        {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
        Change key
      </Button>
    </div>
  {/if}
</form>
