'use client';

// Create ("Save as template") / edit dialog for project templates. Creating
// snapshots the chosen project's setup on the server at save time.

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createProjectTemplate,
  updateProjectTemplate,
  type ProjectTemplateResult,
  type ProjectTemplateRow,
} from '@/app/actions/project-templates';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { invalidateProjectTemplates } from './template-select';

export interface TemplateSourceProject {
  id: string;
  name: string;
  ticketKey: string;
}

export interface TemplateWorkspaceOption {
  id: string;
  name: string;
}

const PRIVATE = 'private';

type Errors = Partial<Record<'name' | 'description' | 'workspaceId' | 'projectId' | 'server', string>>;

export function TemplateDialog({
  open,
  onOpenChange,
  template,
  projects,
  fixedProject,
  workspaces,
  defaultWorkspaceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this template; omit to create one. */
  template?: ProjectTemplateRow;
  /** Projects the viewer administers (create mode, picker). */
  projects?: TemplateSourceProject[];
  /** Create from this project (no picker). */
  fixedProject?: TemplateSourceProject;
  workspaces: TemplateWorkspaceOption[];
  defaultWorkspaceId?: string | null;
  onSaved?: (template: ProjectTemplateRow | undefined) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remount per open so the fields start from the current values. */}
        {open && (
          <TemplateForm
            template={template}
            projects={projects}
            fixedProject={fixedProject}
            workspaces={workspaces}
            defaultWorkspaceId={defaultWorkspaceId}
            onDone={(saved) => {
              onOpenChange(false);
              onSaved?.(saved);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  template,
  projects = [],
  fixedProject,
  workspaces,
  defaultWorkspaceId,
  onDone,
  onCancel,
}: {
  template?: ProjectTemplateRow;
  projects?: TemplateSourceProject[];
  fixedProject?: TemplateSourceProject;
  workspaces: TemplateWorkspaceOption[];
  defaultWorkspaceId?: string | null;
  onDone: (saved: ProjectTemplateRow | undefined) => void;
  onCancel: () => void;
}) {
  const editing = !!template;
  const [projectId, setProjectId] = useState(fixedProject?.id ?? '');
  const [name, setName] = useState(
    template?.name ?? (fixedProject ? `${fixedProject.name} template` : ''),
  );
  const [description, setDescription] = useState(template?.description ?? '');
  const initialWorkspace = template ? template.workspaceId : (defaultWorkspaceId ?? null);
  const [workspaceId, setWorkspaceId] = useState(
    initialWorkspace && workspaces.some((w) => w.id === initialWorkspace) ? initialWorkspace : PRIVATE,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const shared = workspaceId === PRIVATE ? null : workspaceId;
      let result: ProjectTemplateResult;
      try {
        result = template
          ? await updateProjectTemplate({ id: template.id, name, description, workspaceId: shared })
          : await createProjectTemplate({ projectId, name, description, workspaceId: shared });
      } catch {
        setErrors({ server: 'Something went wrong. Try again.' });
        return;
      }
      if (!result.ok) {
        setErrors({ [result.field ?? 'server']: result.error });
        return;
      }
      invalidateProjectTemplates();
      toast.success(editing ? 'Template updated' : `Saved template “${name.trim()}”`);
      onDone(result.template);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit template' : 'Save as template'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Rename the template or change who can use it.'
            : 'Copies the workflow states, labels, estimates, cycle and triage settings, SLAs and issue templates. Issues and members aren’t copied.'}
        </DialogDescription>
      </DialogHeader>

      {!editing && !fixedProject && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-project">Project</Label>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You need to be an owner or admin of a project to save it as a template.
            </p>
          ) : (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="template-project" className="w-full">
                <SelectValue placeholder="Choose a project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.ticketKey}
                    </span>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errors.projectId && <p className="text-sm text-destructive">{errors.projectId}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          value={name}
          maxLength={60}
          autoFocus
          placeholder="Engineering team"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-description">Description</Label>
        <Textarea
          id="template-description"
          value={description}
          maxLength={500}
          rows={2}
          placeholder="What kind of team is this for?"
          onChange={(e) => setDescription(e.target.value)}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-share">Available to</Label>
        <Select value={workspaceId} onValueChange={setWorkspaceId}>
          <SelectTrigger id="template-share" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PRIVATE}>Only me</SelectItem>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                Everyone in {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.workspaceId && <p className="text-sm text-destructive">{errors.workspaceId}</p>}
      </div>

      {errors.server && (
        <p role="alert" className="text-sm text-destructive">
          {errors.server}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim() || (!editing && !projectId)}>
          {pending && <Loader2 className="animate-spin" />}
          {editing ? 'Save' : 'Save template'}
        </Button>
      </DialogFooter>
    </form>
  );
}
