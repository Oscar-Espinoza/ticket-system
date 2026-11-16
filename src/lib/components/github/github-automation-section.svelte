<script lang="ts">
  import { m } from '@/lib/i18n';
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
  } from '@/lib/vcs/automation-state';
  import GithubStateSelect, { DEFAULT_VALUE } from './github-state-select.svelte';
  import type { GithubSettingsProps } from './github-types';

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
        toast.success(m.settings_github_automation_updated());
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
    title={m.settings_github_automation_title()}
    description={m.settings_github_automation_desc({ example })}
  />
  <Field
    id="github-pr-open"
    label={m.settings_github_pr_open()}
    hint={m.settings_github_pr_open_hint()}
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
    label={m.settings_github_pr_merge()}
    hint={m.settings_github_pr_merge_hint({ example })}
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
