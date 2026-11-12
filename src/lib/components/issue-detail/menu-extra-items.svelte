<!--
  Rendered inside IssueDetail's `…` menu, after the host's own
  Copy link / Copy ID items and before Archive / Move to trash.
-->
<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { createTemplate } from '@/lib/actions/templates';
  import { projectHref } from '@/lib/components/app-shell/routes';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { copyIssueMarkdown, duplicateInput } from '@/lib/components/productivity/issue-actions';
  import { setCachedTemplates, useTemplates } from '@/lib/components/productivity/templates-store.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { DropdownMenuItem } from '@/lib/components/ui/dropdown-menu';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWrite = useProjectPermission('write');
  // Only read here to keep the dialog's cached list fresh after a save.
  const templates = useTemplates(() => issue.projectId, false);

  // The menu (and this component) unmounts on select; the save carries on.
  async function saveAsTemplate() {
    const projectId = issue.projectId;
    const cached = templates.current;
    const result = await createTemplate({
      projectId,
      name: issue.title.slice(0, 60),
      title: issue.title,
      description: issue.description ?? '',
      data: {
        stateId: issue.stateId,
        priority: issue.priority,
        assigneeId: issue.assignee?.id ?? null,
        waitingOnId: issue.waitingOn?.id ?? null,
        labelIds: issue.labels.map((l) => l.id),
        estimate: issue.estimate,
      },
    });
    if (!result.ok) {
      toast.error(actionErrorText(result.error, "You don't have permission to do that."));
      return;
    }
    if (cached) setCachedTemplates(projectId, [...cached, result.template]);
    toast.success(`Saved template “${result.template.name}”`, {
      action: {
        label: 'Edit',
        onClick: () => void goto(projectHref(projectId, 'settings/templates')),
      },
    });
  }
</script>

<DropdownMenuItem onSelect={() => void copyIssueMarkdown(issue)}>
  <Link2Icon />
  Copy as markdown link
</DropdownMenuItem>
{#if canWrite.current}
  <DropdownMenuItem onSelect={() => mutations.create(duplicateInput(issue))}>
    <CopyIcon />
    Duplicate issue
  </DropdownMenuItem>
  <DropdownMenuItem onSelect={() => void saveAsTemplate()}>
    <FileTextIcon />
    Save as template
  </DropdownMenuItem>
{/if}
