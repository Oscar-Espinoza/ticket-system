'use client';

// Workspace › Teams: the workspace's projects, "Add project" (projects the
// viewer administers) and "New project" (created inside the workspace).
// Projects the viewer isn't a member of show their name only, and only when
// they're workspace-visible (with a Join button); private ones stay hidden.
// Sub-teams are listed under their parent (D4a).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CornerDownRight, FolderPlus, Loader2, Lock, MoreHorizontal, Plus, Unlink } from 'lucide-react';

import {
  addProjectToWorkspace,
  createWorkspaceProject,
  joinWorkspaceProject,
  removeProjectFromWorkspace,
} from '@/app/actions/workspaces';
import {
  TemplateSelect,
  useProjectTemplates,
} from '@/components/project-templates/template-select';
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

/** The page's rows plus the team-structure columns (optional until it passes them). */
export type WorkspaceTeamRow = WorkspaceProjectRow & {
  parentId?: string | null;
  visibility?: string;
};

const MAX_DEPTH = 4;

/**
 * Visible rows in tree order with their depth: private projects the viewer
 * isn't in are dropped (the server should not send them at all; this is the
 * backstop), sub-teams follow their parent. Orphans / cycles go top level.
 */
function teamTree(rows: WorkspaceTeamRow[]): { project: WorkspaceTeamRow; depth: number }[] {
  const visible = rows.filter((p) => p.viewerRole !== null || p.visibility === 'workspace');
  const ids = new Set(visible.map((p) => p.id));
  const childrenOf = new Map<string, WorkspaceTeamRow[]>();
  const roots: WorkspaceTeamRow[] = [];
  for (const project of visible) {
    const parentId = project.parentId;
    if (parentId && parentId !== project.id && ids.has(parentId)) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), project]);
    } else {
      roots.push(project);
    }
  }
  const out: { project: WorkspaceTeamRow; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (list: WorkspaceTeamRow[], depth: number) => {
    for (const project of list) {
      if (seen.has(project.id)) continue;
      seen.add(project.id);
      out.push({ project, depth });
      if (depth < MAX_DEPTH) walk(childrenOf.get(project.id) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  walk(visible.filter((p) => !seen.has(p.id)), 0);
  return out;
}

export function WorkspaceProjects({
  workspaceId,
  projects: allProjects,
  eligible,
  role,
}: {
  workspaceId: string;
  projects: WorkspaceTeamRow[];
  eligible: EligibleProject[];
  role: WorkspaceRole;
}) {
  const [dialog, setDialog] = useState<'add' | 'create' | null>(null);
  const isAdmin = role !== 'member';
  const tree = teamTree(allProjects);
  const projects = tree.map((row) => row.project);

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
          {tree.map(({ project, depth }) => (
            <ProjectRow
              key={project.id}
              workspaceId={workspaceId}
              project={project}
              depth={depth}
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
  depth,
  canRemove,
}: {
  workspaceId: string;
  project: WorkspaceTeamRow;
  depth: number;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [joining, startJoin] = useTransition();
  const isMember = project.viewerRole !== null;

  function join() {
    startJoin(async () => {
      const result = await joinWorkspaceProject({ workspaceId, projectId: project.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Joined ${project.name}`);
      router.push(`/dashboard/projects/${project.id}`);
    });
  }

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
      {project.visibility === 'private' && (
        <Lock aria-label="Private team" className="size-3 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  return (
    <li
      className="flex min-h-11 items-center gap-3 px-3 py-2"
      style={depth > 0 ? { paddingLeft: `${0.75 + (depth - 1) * 1.25}rem` } : undefined}
    >
      {depth > 0 && (
        <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      )}
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
      {isMember ? (
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {PROJECT_ROLE_LABEL[project.viewerRole!]}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-16 shrink-0"
          disabled={joining}
          onClick={join}
          aria-label={`Join ${project.name}`}
        >
          {joining ? <Loader2 className="animate-spin" /> : 'Join'}
        </Button>
      )}
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
  const [templateId, setTemplateId] = useState('');
  const templates = useProjectTemplates(open);
  const [errors, setErrors] = useState<{ name?: string; ticketKey?: string; server?: string }>({});
  const [isPending, startTransition] = useTransition();

  function close() {
    setName('');
    setTicketKey('');
    setTemplateId('');
    setErrors({});
    onClose();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createWorkspaceProject({
        workspaceId,
        name,
        ticketKey,
        templateId: templateId || undefined,
      });
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-project-template">Template</Label>
            <TemplateSelect
              id="ws-project-template"
              templates={templates}
              value={templateId}
              onChange={setTemplateId}
            />
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
