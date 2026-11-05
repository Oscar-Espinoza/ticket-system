<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { updateGithubAutomation } from '@/lib/actions/github';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import SectionHeading from '@/lib/components/settings/section-heading.svelte';
  import {
    AUTOMATION_OFF,
    defaultPrMergeState,
    defaultPrOpenState,
  } from '@/lib/github/automation';
  import GithubStateSelect, { DEFAULT_VALUE } from './github-state-select.svelte';
  import type { GithubSettingsProps } from './github-settings.svelte';

  let { projectId, canEdit, prOpenStateId, prMergeStateId }: GithubSettingsProps = $props();

  const data = useProjectData();
  const states = $derived(data.states);
  const example = $derived(`${data.project.ticketKey}-12`);

  const toValue = (setting: string | null) => setting ?? DEFAULT_VALUE;
  const fromValue = (value: string) => (value === DEFAULT_VALUE ? null : value);

  // A saved state id that was since deleted shows (and behaves) as the default.
  const known = (setting: string | null) =>
    setting === AUTOMATION_OFF || states.some((s) => s.id === setting) ? setting : null;

  let open = $state(untrack(() => toValue(known(prOpenStateId))));
  let merge = $state(untrack(() => toValue(known(prMergeStateId))));
  let pending = $state(false);

  async function save(next: { open: string; merge: string }) {
    const previous = { open, merge };
    open = next.open;
    merge = next.merge;
    pending = true;
    try {
      const result = await updateGithubAutomation({
        projectId,
        prOpenStateId: fromValue(next.open),
        prMergeStateId: fromValue(next.merge),
      });
      if (result.ok) {
        toast.success('Automation updated');
      } else {
        open = previous.open;
        merge = previous.merge;
        toast.error(result.error);
      }
    } finally {
      pending = false;
    }
  }
</script>

<section class="flex flex-col gap-5" aria-labelledby="github-automation">
  <SectionHeading
    title="Pull request automation"
    description={`Move issues when a linked pull request changes. Issues are linked by their ID in the branch name or PR title, or with magic words like “Fixes ${example}” in the description. Issues only move forward — never out of a completed or canceled state.`}
  />
  <Field
    id="github-pr-open"
    label="When a pull request is opened"
    hint="Drafts wait until they're marked ready for review."
  >
    <GithubStateSelect
      id="github-pr-open"
      value={open}
      onChange={(value) => save({ open: value, merge })}
      {states}
      fallback={defaultPrOpenState(states)}
      disabled={!canEdit || pending}
    />
  </Field>
  <Field
    id="github-pr-merge"
    label="When a pull request is merged"
    hint={`Also applies to commits on the default branch that say “Fixes ${example}”. “Ref ${example}” or “Part of ${example}” only link.`}
  >
    <GithubStateSelect
      id="github-pr-merge"
      value={merge}
      onChange={(value) => save({ open, merge: value })}
      {states}
      fallback={defaultPrMergeState(states)}
      disabled={!canEdit || pending}
    />
  </Field>
</section>
