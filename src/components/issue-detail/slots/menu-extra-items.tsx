'use client';

// Owner: B10. Rendered inside IssueDetail's `…` menu, after the host's own
// Copy link / Copy ID items and before Archive / Move to trash.

import { useRouter } from 'next/navigation';
import { Copy, FileText, Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { createTemplate } from '@/app/actions/templates';
import { projectHref } from '@/components/app-shell/routes';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { copyIssueMarkdown, duplicateInput } from '@/components/productivity/issue-actions';
import { setCachedTemplates, useTemplates } from '@/components/productivity/templates-store';
import { useProjectPermission } from '@/components/project/project-data';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { IssueRow } from '@/lib/issue-model';

export function MenuExtraItems({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  const router = useRouter();
  // Only read here to keep the dialog's cached list fresh after a save.
  const templates = useTemplates(issue.projectId, false);

  // The menu (and this component) unmounts on select; the save carries on.
  const saveAsTemplate = async () => {
    const result = await createTemplate({
      projectId: issue.projectId,
      name: issue.title.slice(0, 60),
      title: issue.title,
      description: issue.description ?? '',
      data: {
        stateId: issue.stateId,
        priority: issue.priority,
        assigneeId: issue.assignee?.id ?? null,
        labelIds: issue.labels.map((l) => l.id),
        estimate: issue.estimate,
      },
    });
    if (!result.ok) {
      toast.error(result.error === 'Forbidden' ? "You don't have permission to do that." : result.error);
      return;
    }
    if (templates) setCachedTemplates(issue.projectId, [...templates, result.template]);
    toast.success(`Saved template “${result.template.name}”`, {
      action: {
        label: 'Edit',
        onClick: () => router.push(projectHref(issue.projectId, 'settings/templates')),
      },
    });
};

  return (
    <>
      <DropdownMenuItem onSelect={() => void copyIssueMarkdown(issue)}>
        <Link2 />
        Copy as markdown link
      </DropdownMenuItem>
      {canWrite && (
        <>
          <DropdownMenuItem onSelect={() => mutations.create(duplicateInput(issue))}>
            <Copy />
            Duplicate issue
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void saveAsTemplate()}>
            <FileText />
            Save as template
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
