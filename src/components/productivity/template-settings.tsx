'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { FilePlus2, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  type IssueTemplate,
} from '@/app/actions/templates';
import { projectHref } from '@/components/app-shell/routes';
import { Field } from '@/components/settings/field';
import { useProjectData } from '@/components/project/project-data';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { formatEstimate } from '@/lib/estimates';
import type { IssuePatch } from '@/lib/issue-model';
import { PropertyChips } from './property-chips';
import { TEMPLATE_PARAM } from './new-issue-bus';
import { setCachedTemplates, templateProps } from './templates-store';

export function TemplateSettings({
  projectId,
  templates,
  canEdit,
}: {
  projectId: string;
  templates: IssueTemplate[];
  /** Members and up; guests see the list read-only. */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<IssueTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<IssueTemplate | null>(null);
  const [, startDelete] = useTransition();

  // Keep the new-issue dialog's cached list in step with this page.
  useEffect(() => setCachedTemplates(projectId, templates), [projectId, templates]);

  const confirmDelete = (template: IssueTemplate) =>
    startDelete(async () => {
      const result = await deleteTemplate({ projectId, id: template.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Deleted template “${template.name}”`);
    });

  return (
    <div className="flex flex-col gap-4">
      {canEdit && templates.length > 0 && (
        <div>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus />
            New template
          </Button>
        </div>
      )}

      {templates.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No templates yet"
          description="Save a template for issues you create often — bug reports, feature requests, chores."
          action={
            canEdit ? (
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus />
                New template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              canEdit={canEdit}
              onEdit={() => setEditing(template)}
              onDelete={() => setDeleting(template)}
            />
          ))}
        </ul>
      )}

      <TemplateEditor
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        projectId={projectId}
        template={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Issues created from it keep their content. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) confirmDelete(deleting);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateRow({
  template,
  canEdit,
  onEdit,
  onDelete,
}: {
  template: IssueTemplate;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const data = useProjectData();
  const props = templateProps(template, data);
  const state = data.states.find((s) => s.id === props.stateId);
  const assignee = data.members.find((m) => m.id === props.assigneeId);
  const labels = data.labels.filter((l) => props.labelIds?.includes(l.id));
  const createHref = `${projectHref(data.project.id)}?${TEMPLATE_PARAM}=${encodeURIComponent(template.id)}`;

  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="truncate text-left font-medium outline-none hover:underline focus-visible:underline"
          >
            {template.name}
          </button>
        ) : (
          <span className="truncate font-medium">{template.name}</span>
        )}
        {template.title && (
          <span className="truncate text-xs text-muted-foreground">{template.title}</span>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
        {state && (
          <span className="flex items-center gap-1" title={`Status: ${state.name}`}>
            <StateIcon state={state} size={14} />
            {state.name}
          </span>
        )}
        {props.priority && props.priority !== 'none' && (
          <PriorityIcon priority={props.priority} size={14} />
        )}
        {labels.length > 0 && (
          <span className="flex items-center gap-0.5" title={labels.map((l) => l.name).join(', ')}>
            {labels.slice(0, 4).map((l) => (
              <span
                key={l.id}
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
            ))}
          </span>
        )}
        {props.estimate != null && (
          <span>{formatEstimate(data.project.estimateScale, props.estimate)}</span>
        )}
        {assignee && <Avatar name={assignee.name} src={assignee.image} size={20} />}
      </div>

      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${template.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={createHref}>
                <FilePlus2 />
                Create issue
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function TemplateEditor({
  projectId,
  template,
  open,
  onClose,
}: {
  projectId: string;
  /** null = new template. */
  template: IssueTemplate | null;
  open: boolean;
  onClose: () => void;
}) {
  const data = useProjectData();
  const uid = useId();
  const [name, setName] = useState(template?.name ?? '');
  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [props, setProps] = useState<IssuePatch>(() =>
    template ? templateProps(template, data) : {},
  );
  const [errors, setErrors] = useState<{ field?: string; message: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const input = { projectId, name, title, description, data: props };
      const result = template
        ? await updateTemplate({ ...input, id: template.id })
        : await createTemplate(input);
      if (!result.ok) {
        setErrors({ field: result.field, message: result.error });
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(template ? 'Template updated' : `Created template “${result.template.name}”`);
      onClose();
    });
  };

  const fieldError = (field: string) => (errors?.field === field ? errors.message : undefined);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            New issues from this template start with these values.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id={`${uid}-name`} label="Template name" error={fieldError('name')}>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bug report"
              maxLength={60}
              autoFocus
              aria-invalid={fieldError('name') ? true : undefined}
            />
          </Field>
          <Field
            id={`${uid}-title`}
            label="Issue title"
            hint="Optional — prefilled when the new issue's title is empty."
            error={fieldError('title')}
          >
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bug: "
              maxLength={200}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>Description</Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'## Steps to reproduce\n\n## Expected\n\n## Actual'}
              rows={6}
            />
            {fieldError('description') && (
              <p role="alert" className="text-xs text-destructive">
                {fieldError('description')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Default properties</span>
            <PropertyChips
              value={props}
              onChange={(patch) => setProps((current) => ({ ...current, ...patch }))}
              showDueDate={false}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {template ? 'Save' : 'Create template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
