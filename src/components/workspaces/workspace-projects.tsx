'use client';

// Workspace › Teams: the workspace's projects, "Add project" (projects the
// viewer administers) and "New project" (created inside the workspace).
// Projects the viewer isn't a member of show their name only.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FolderPlus, Loader2, MoreHorizontal, Plus, Unlink } from 'lucide-react';

import {
  addProjectToWorkspace,
  createWorkspaceProject,
  removeProjectFromWorkspace,
} from '@/app/actions/workspaces';
import { EmptyState, LabelChip } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roleAllows } from '@/lib/roles';
import { PROJECT_ROLE_LABEL } from './role-rules';
import type { EligibleProject, WorkspaceProjectRow, WorkspaceRole } from './workspace-types';

export function WorkspaceProjects({
  workspaceId,
  projects,
  eligible,
  role,
}: {
  workspaceId: string;
  projects: WorkspaceProjectRow[];
  eligible: EligibleProject[];
  role: WorkspaceRole;
}) {
  const [dialog, setDialog] = useState<'add' | 'create' | null>(null);
  const isAdmin = role !== 'member';

  return (
    <section aria-labelledby="workspace-projects">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="workspace-projects" className="text-base font-medium">
          Teams <span className="text-muted-foreground">· {projects.length}</span>
        </h2>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setDialog('add')}>
              <FolderPlus />
              Add project
            </Button>
          )}
          <Button size="sm" onClick={() => setDialog('create')}>
            <Plus />
            New project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          className="rounded-lg border"
          icon={<FolderPlus />}
          title="No projects yet"
          description={
            isAdmin
              ? 'Add one of your projects or create a new one in this workspace.'
              : 'Create a project in this workspace to get started.'
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              workspaceId={workspaceId}
              project={project}
              canRemove={
                isAdmin || (project.viewerRole !== null && roleAllows(project.viewerRole, 'admin'))
              }
            />
          ))}
        </ul>
      )}

      <AddProjectDialog
        open={dialog === 'add'}
        onClose={() => setDialog(null)}
        workspaceId={workspaceId}
        eligible={eligible}
      />
      <CreateProjectDialog
        open={dialog === 'create'}
        onClose={() => setDialog(null)}
        workspaceId={workspaceId}
      />
    </section>
  );
}

function ProjectRow({
  workspaceId,
  project,
  canRemove,
}: {
  workspaceId: string;
  project: WorkspaceProjectRow;
  canRemove: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const isMember = project.viewerRole !== null;

  function remove() {
    startTransition(async () => {
      const result = await removeProjectFromWorkspace({ workspaceId, projectId: project.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${project.name} left the workspace`);
    });
  }

  const body = (
    <>
      <LabelChip dot={false} className="font-mono">
        {project.ticketKey}
      </LabelChip>
      <span className="truncate text-sm font-medium">{project.name}</span>
    </>
  );

  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2">
      {isMember ? (
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{body}</span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {project.openCount !== null && `${project.openCount} open · `}
        {project.memberCount} member{project.memberCount === 1 ? '' : 's'}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
        {project.viewerRole ? PROJECT_ROLE_LABEL[project.viewerRole] : 'Not a member'}
      </span>
      {canRemove ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${project.name}`}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={remove}>
              <Unlink />
              Remove from workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-7 shrink-0" aria-hidden="true" />
      )}
    </li>
  );
}

function AddProjectDialog({
  open,
  onClose,
  workspaceId,
  eligible,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  eligible: EligibleProject[];
}) {
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = eligible.find((project) => project.id === projectId);

  function close() {
    setProjectId('');
    setError(null);
    onClose();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    startTransition(async () => {
      const result = await addProjectToWorkspace({ workspaceId, projectId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${selected?.name ?? 'Project'} added`);
      close();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add project</DialogTitle>
            <DialogDescription>
              Move a project you own or administer into this workspace. Its members and issues
              don’t change.
            </DialogDescription>
          </DialogHeader>
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don’t administer any project outside this workspace.
            </p>
          ) : (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full" aria-label="Project">
                <SelectValue placeholder="Choose a project…" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((project) => (
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
          {selected?.currentWorkspace && (
            <p className="text-sm text-muted-foreground">
              It will leave <strong className="text-foreground">{selected.currentWorkspace}</strong>.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !projectId}>
              {isPending && <Loader2 className="animate-spin" />}
              Add project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateProjectDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [ticketKey, setTicketKey] = useState('');
  const [errors, setErrors] = useState<{ name?: string; ticketKey?: string; server?: string }>({});
  const [isPending, startTransition] = useTransition();

  function close() {
    setName('');
    setTicketKey('');
    setErrors({});
    onClose();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createWorkspaceProject({ workspaceId, name, ticketKey });
      if (!result.ok) {
        const field =
          result.field === 'name' || result.field === 'ticketKey' ? result.field : 'server';
        setErrors({ [field]: result.error });
        return;
      }
      toast.success('Project created');
      close();
      if (result.projectId) router.push(`/dashboard/projects/${result.projectId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New project in workspace</DialogTitle>
            <DialogDescription>You’ll be the project’s owner.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-project-name">Project name</Label>
            <Input
              id="ws-project-name"
              autoFocus
              value={name}
              maxLength={100}
              placeholder="Mobile app"
              onChange={(e) => {
                setName(e.target.value);
                setErrors({});
              }}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-project-key">Ticket key</Label>
            <Input
              id="ws-project-key"
              value={ticketKey}
              placeholder="MOB"
              onChange={(e) => {
                setTicketKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6));
                setErrors({});
              }}
              aria-invalid={errors.ticketKey ? true : undefined}
              aria-describedby="ws-project-key-hint"
              className="font-mono"
            />
            <p id="ws-project-key-hint" className="text-sm text-muted-foreground">
              2–6 uppercase letters, unique across all projects.
            </p>
            {errors.ticketKey && <p className="text-sm text-destructive">{errors.ticketKey}</p>}
          </div>
          {errors.server && <p className="text-sm text-destructive">{errors.server}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || ticketKey.length < 2}>
              {isPending && <Loader2 className="animate-spin" />}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
