'use client';

// /dashboard/templates: project templates the viewer can use. Owners edit and
// delete theirs; shared templates from workspaces are read-only here.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutTemplate, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteProjectTemplate, type ProjectTemplateRow } from '@/app/actions/project-templates';
import { relativeTime } from '@/components/issues/issue-properties';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, LabelChip } from '@/components/ui-icons';
import { ESTIMATE_SCALE_LABEL } from '@/lib/estimates';
import {
  TemplateDialog,
  type TemplateSourceProject,
  type TemplateWorkspaceOption,
} from './template-dialog';
import { invalidateProjectTemplates } from './template-select';

type Dialog = { kind: 'create' } | { kind: 'edit'; template: ProjectTemplateRow } | null;

function summaryParts(t: ProjectTemplateRow): string[] {
  const s = t.summary;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return [
    plural(s.states, 'state'),
    plural(s.labels, 'label'),
    s.issueTemplates > 0 && plural(s.issueTemplates, 'issue template'),
    s.estimateScale !== 'none' && `${ESTIMATE_SCALE_LABEL[s.estimateScale]} estimates`,
    s.cyclesEnabled && 'Cycles',
    s.triageEnabled && 'Triage',
    s.sla && 'SLAs',
  ].filter((part): part is string => typeof part === 'string');
}

export function TemplatesManager({
  templates,
  projects,
  workspaces,
}: {
  templates: ProjectTemplateRow[];
  projects: TemplateSourceProject[];
  workspaces: TemplateWorkspaceOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<ProjectTemplateRow | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-medium">Project templates</h1>
        {templates.length > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">{templates.length}</span>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setDialog({ kind: 'create' })}>
          <Plus />
          New template
        </Button>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Start new projects with a ready-made workflow, labels and settings. Pick a template in
        the “Create project” dialog.
      </p>

      {templates.length === 0 ? (
        <EmptyState
          className="rounded-lg border"
          icon={<LayoutTemplate />}
          title="No templates yet"
          description="Save a project you administer as a template to reuse its setup."
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'create' })}>
              <Plus />
              New template
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
          {templates.map((template) => (
            <li key={template.id} className="flex items-start gap-3 px-3 py-2.5">
              <LayoutTemplate
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{template.name}</span>
                  {template.workspaceName && (
                    <LabelChip dot={false}>{template.workspaceName}</LabelChip>
                  )}
                </div>
                {template.description && (
                  <p className="truncate text-sm text-muted-foreground">{template.description}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summaryParts(template).join(' · ')}
                </p>
              </div>
              <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                {template.isOwner ? '' : `${template.ownerName ?? 'Someone'} · `}
                {relativeTime(new Date(template.updatedAt))}
              </span>
              {template.isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${template.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', template })}>
                      <Pencil />
                      Edit…
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(template)}>
                      <Trash2 />
                      Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="size-7 shrink-0" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}

      <TemplateDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        template={dialog?.kind === 'edit' ? dialog.template : undefined}
        projects={projects}
        workspaces={workspaces}
        onSaved={() => router.refresh()}
      />
      <DeleteDialog template={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteDialog({
  template,
  onClose,
}: {
  template: ProjectTemplateRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!template) return;
    startTransition(async () => {
      const result = await deleteProjectTemplate({ id: template.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      invalidateProjectTemplates();
      toast.success(`Deleted “${template.name}”`);
      onClose();
      router.refresh();
    });
  }

  return (
    <AlertDialog open={template !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{template?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Projects already created from it don’t change. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
