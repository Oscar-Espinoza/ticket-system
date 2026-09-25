'use client';

// Epic page: header (editable name), tabs Overview · Updates · Issues (`?tab=`).
// Overview = description, latest update, milestones + a property sidebar.
// Property edits are optimistic (useOptimistic) and settle on the refreshed props.
// Issues from sibling projects (cross-project epics) get a project switcher on
// the Issues tab; only this project's issues are editable in place.

import { EpicDocuments } from '@/components/documents/epic-documents';
import type { DocumentSummary } from '@/components/documents/document-model';
import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Link2,
  MoreHorizontal,
  Pencil,
  Tag,
  Target,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { setEpicLabels } from '@/app/actions/epic-labels';
import { archiveEpic, unarchiveEpic, updateEpic, type EpicInput } from '@/app/actions/epics';
import { setEpicInitiative } from '@/app/actions/initiatives';
import { PropertyRow } from '@/components/issue-detail/property-row';
import { useDraft } from '@/components/issue-detail/use-draft';
import { IssuesView } from '@/components/issues/issues-view';
import { FavoriteButton } from '@/components/navigation/favorite-button';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { EpicForeignIssues } from './epic-foreign-issues';
import { EpicIcon, EpicStatusIcon, HealthChip } from './epic-glyphs';
import { EpicLabelChips, EpicLabelPicker } from './epic-labels';
import {
  DEFAULT_EPIC_COLOR,
  EPIC_DESCRIPTION_MAX,
  EPIC_NAME_MAX,
  EPIC_STATUS_LABEL,
  type EpicLabelRow,
  type EpicRelationRow,
  type EpicRow,
  type EpicUpdateRow,
  type InitiativeOption,
  type MilestoneRow,
  type ProjectRef,
} from './epic-model';
import {
  ColorSwatches,
  DatePicker,
  EpicStatusPicker,
  HealthPicker,
  InitiativePicker,
  MemberPicker,
} from './epic-pickers';
import { ProgressBlock } from './epic-progress';
import { EpicDependencies } from './epic-relations';
import { EpicUpdates, UpdateCard } from './epic-updates';
import { MilestonesSection } from './milestones-section';
import { RichText, RichTextEditor } from './rich-text';

const TABS = ['overview', 'updates', 'issues'] as const;
type Tab = (typeof TABS)[number];

function setParam(name: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value === null) params.delete(name);
  else params.set(name, value);
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

const setTabParam = (tab: Tab) => setParam('tab', tab === 'overview' ? null : tab);

function PropertyButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 max-w-full gap-2 font-normal', className)}
      {...props}
    />
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export interface EpicDetailProps {
  epic: EpicRow;
  milestones: MilestoneRow[];
  updates: EpicUpdateRow[];
  /** Active issues from every project the viewer is in (cross-project epics). */
  issues: IssueRow[];
  /** Projects of `issues` other than this one. */
  issueProjects: ProjectRef[];
  /** The project's epic labels. */
  labels: EpicLabelRow[];
  relations: EpicRelationRow[];
  /** Project docs linked to this epic (D2). */
  documents?: DocumentSummary[];
  /** null: the project isn't in a workspace the viewer belongs to. */
  initiatives: InitiativeOption[] | null;
  workspaceSlug: string | null;
  defaultView?: string;
}

export function EpicDetail({
  epic: serverEpic,
  milestones,
  updates,
  issues,
  issueProjects,
  labels,
  relations,
  documents = [],
  initiatives,
  workspaceSlug,
  defaultView,
}: EpicDetailProps) {
  const { project, members, viewer, epics: projectEpics } = useProjectData();
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const searchParams = useSearchParams();
  const [epic, patchOptimistic] = useOptimistic(
    serverEpic,
    (current, patch: Partial<EpicRow>) => ({ ...current, ...patch }),
  );
  const [, startTransition] = useTransition();

  const ownIssues = issues.filter((i) => i.projectId === project.id);
  const foreignProject = issueProjects.find((p) => p.id === searchParams.get('project')) ?? null;

  const param = searchParams.get('tab');
  const tab: Tab = TABS.includes(param as Tab)
    ? (param as Tab)
    : searchParams.get('issue')
      ? 'issues'
      : 'overview';

  const save = (patch: EpicInput, optimistic: Partial<EpicRow>) =>
    startTransition(async () => {
      patchOptimistic(optimistic);
      const result = await updateEpic({ projectId: project.id, id: epic.id, patch });
      if (!result.ok) toast.error(result.error);
    });

  const setInitiative = (initiativeId: string | null) =>
    startTransition(async () => {
      patchOptimistic({ initiativeId });
      const result = await setEpicInitiative({
        projectId: project.id,
        epicId: epic.id,
        initiativeId,
      });
      if (!result.ok) toast.error(result.error);
    });

  const setLabels = (labelIds: string[]) =>
    startTransition(async () => {
      patchOptimistic({ labelIds });
      const result = await setEpicLabels({ projectId: project.id, epicId: epic.id, labelIds });
      if (!result.ok) toast.error(result.error);
    });

  const toggleArchive = () =>
    startTransition(async () => {
      patchOptimistic({ archivedAt: epic.archivedAt ? null : new Date() });
      const action = epic.archivedAt ? unarchiveEpic : archiveEpic;
      const result = await action({ projectId: project.id, id: epic.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(epic.archivedAt ? 'Epic restored' : 'Epic archived');
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      toast.success('Copied epic link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };

  const lead = epic.lead;
  const initiative = initiatives?.find((i) => i.id === epic.initiativeId) ?? null;
  const picker = (trigger: ReactNode, wrap: (trigger: ReactNode) => ReactNode) =>
    canWrite ? wrap(trigger) : trigger;

  const sidebar = (
    <aside aria-label="Epic properties" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <PropertyRow label="Status">
          {picker(
            <PropertyButton disabled={!canWrite}>
              <EpicStatusIcon status={epic.status} />
              {EPIC_STATUS_LABEL[epic.status]}
            </PropertyButton>,
            (trigger) => (
              <EpicStatusPicker value={epic.status} onChange={(status) => save({ status }, { status })}>
                {trigger}
              </EpicStatusPicker>
            ),
          )}
        </PropertyRow>
        <PropertyRow label="Health">
          {picker(
            <PropertyButton disabled={!canWrite}>
              {epic.health ? <HealthChip health={epic.health} className="text-sm" /> : <Muted>No updates</Muted>}
            </PropertyButton>,
            (trigger) => (
              <HealthPicker value={epic.health} onChange={(health) => save({ health }, { health })}>
                {trigger}
              </HealthPicker>
            ),
          )}
        </PropertyRow>
        <PropertyRow label="Lead">
          {picker(
            <PropertyButton disabled={!canWrite}>
              {lead ? (
                <>
                  <Avatar name={lead.name} src={lead.image} size={20} />
                  <span className="truncate">{lead.name}</span>
                </>
              ) : (
                <>
                  <UserRound className="text-muted-foreground" />
                  <Muted>No lead</Muted>
                </>
              )}
            </PropertyButton>,
            (trigger) => (
              <MemberPicker
                value={lead?.id ?? null}
                members={members}
                viewerId={viewer.id}
                onChange={(leadId) => {
                  const member = members.find((m) => m.id === leadId);
                  save(
                    { leadId },
                    { lead: member ? { id: member.id, name: member.name, image: member.image } : null },
                  );
                }}
              >
                {trigger}
              </MemberPicker>
            ),
          )}
        </PropertyRow>
        <PropertyRow label="Labels">
          {picker(
            <PropertyButton disabled={!canWrite}>
              {epic.labelIds?.length ? (
                <EpicLabelChips
                  labels={labels}
                  labelIds={epic.labelIds}
                  max={2}
                  className="flex-nowrap overflow-hidden"
                />
              ) : (
                <>
                  <Tag className="text-muted-foreground" />
                  <Muted>Add labels</Muted>
                </>
              )}
            </PropertyButton>,
            (trigger) => (
              <EpicLabelPicker
                projectId={project.id}
                labels={labels}
                value={epic.labelIds ?? []}
                onChange={setLabels}
                canCreate={canWrite}
              >
                {trigger}
              </EpicLabelPicker>
            ),
          )}
        </PropertyRow>
        <PropertyRow label="Start date">
          {picker(
            <PropertyButton disabled={!canWrite}>
              <CalendarRange className="text-muted-foreground" />
              {epic.startDate ? formatDueDate(epic.startDate) : <Muted>Set start</Muted>}
            </PropertyButton>,
            (trigger) => (
              <DatePicker
                value={epic.startDate}
                clearLabel="Clear start date"
                onChange={(startDate) => save({ startDate }, { startDate })}
              >
                {trigger}
              </DatePicker>
            ),
          )}
        </PropertyRow>
        <PropertyRow label="Target date">
          {picker(
            <PropertyButton disabled={!canWrite}>
              <CalendarDays className="text-muted-foreground" />
              {epic.targetDate ? formatDueDate(epic.targetDate) : <Muted>Set target</Muted>}
            </PropertyButton>,
            (trigger) => (
              <DatePicker
                value={epic.targetDate}
                clearLabel="Clear target date"
                onChange={(targetDate) => save({ targetDate }, { targetDate })}
              >
                {trigger}
              </DatePicker>
            ),
          )}
        </PropertyRow>
        {initiatives && (
          <PropertyRow label="Initiative">
            {picker(
              <PropertyButton disabled={!canWrite}>
                <Target className="text-muted-foreground" />
                {initiative ? (
                  <span className="truncate">{initiative.name}</span>
                ) : (
                  <Muted>{initiatives.length ? 'Add to initiative' : 'No initiatives'}</Muted>
                )}
              </PropertyButton>,
              (trigger) => (
                <InitiativePicker
                  value={epic.initiativeId}
                  initiatives={initiatives}
                  onChange={setInitiative}
                >
                  {trigger}
                </InitiativePicker>
              ),
            )}
            {initiative && workspaceSlug && (
              <Link
                href={`/dashboard/workspaces/${workspaceSlug}/initiatives/${initiative.id}`}
                className="ml-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open
              </Link>
            )}
          </PropertyRow>
        )}
        <PropertyRow label="Color">
          {canWrite ? (
            <Popover>
              <PopoverTrigger asChild>
                <PropertyButton>
                  <EpicIcon color={epic.color} />
                  <Muted>Change</Muted>
                </PropertyButton>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <ColorSwatches
                  value={epic.color ?? DEFAULT_EPIC_COLOR}
                  onChange={(color) => save({ color }, { color })}
                  className="max-w-40"
                />
              </PopoverContent>
            </Popover>
          ) : (
            <EpicIcon color={epic.color} />
          )}
        </PropertyRow>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Progress</span>
        <ProgressBlock progress={epic.progress} color={epic.color} />
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/dashboard/projects/${project.id}/epics`} className="hover:text-foreground">
          Epics
        </Link>
        <ChevronRight className="size-3" />
        <span className="truncate text-foreground">{epic.name}</span>
      </div>

      <div className="mb-3 flex items-start gap-2">
        <EpicIcon color={epic.color} className="mt-2 size-5" />
        <EpicName
          name={epic.name}
          canWrite={canWrite}
          onSave={(name) => save({ name }, { name })}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 pt-1">
          <FavoriteButton targetType="epic" targetId={epic.id} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Epic actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 />
                Copy link
              </DropdownMenuItem>
              {canWrite && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={toggleArchive}>
                    {epic.archivedAt ? <ArchiveRestore /> : <Archive />}
                    {epic.archivedAt ? 'Unarchive' : 'Archive'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {epic.archivedAt && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Archive className="size-4" />
          <span>This epic is archived — it’s hidden from pickers and the roadmap.</span>
          {canWrite && (
            <Button size="xs" variant="outline" className="ml-auto" onClick={toggleArchive}>
              Unarchive
            </Button>
          )}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => TABS.includes(value as Tab) && setTabParam(value as Tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="line" className="mb-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="updates">
            Updates
            {updates.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">{updates.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="issues">
            Issues
            <span className="text-xs text-muted-foreground tabular-nums">{issues.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="min-h-0">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex min-w-0 flex-col gap-8">
              <EpicDescription
                description={epic.description}
                canWrite={canWrite}
                onSave={(description) => save({ description }, { description })}
              />
              {updates[0] && (
                <section aria-labelledby="latest-update" className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h2 id="latest-update" className="text-sm font-medium">
                      Latest update
                    </h2>
                    <button
                      type="button"
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setTabParam('updates')}
                    >
                      All updates
                    </button>
                  </div>
                  <UpdateCard update={updates[0]} compact />
                </section>
              )}
              <MilestonesSection
                projectId={project.id}
                epicId={epic.id}
                milestones={milestones}
                color={epic.color}
                canWrite={canWrite}
              />
              <EpicDependencies
                projectId={project.id}
                epic={epic}
                relations={relations}
                candidates={projectEpics}
                canWrite={canWrite}
              />
              <EpicDocuments projectId={project.id} epicId={epic.id} documents={documents} />
            </div>
            {sidebar}
          </div>
        </TabsContent>

        <TabsContent value="updates">
          <EpicUpdates
            projectId={project.id}
            epicId={epic.id}
            updates={updates}
            currentHealth={epic.health}
            viewer={viewer}
            canWrite={canWrite}
            isAdmin={isAdmin}
          />
        </TabsContent>

        {/* Mounted only while active: IssuesView registers list hotkeys and palette commands. */}
        {tab === 'issues' && (
          <TabsContent value="issues" className="flex min-h-0 flex-1 flex-col">
            {issueProjects.length > 0 && (
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                spacing={0}
                value={foreignProject?.id ?? project.id}
                onValueChange={(value) =>
                  value && setParam('project', value === project.id ? null : value)
                }
                aria-label="Issues by project"
                className="mb-3 flex-wrap"
              >
                {[{ id: project.id, name: project.name, ticketKey: project.ticketKey }, ...issueProjects].map(
                  (p) => (
                    <ToggleGroupItem key={p.id} value={p.id} className="gap-1.5 px-2.5 text-xs">
                      <span className="font-mono text-muted-foreground">{p.ticketKey}</span>
                      <span className="max-w-40 truncate">{p.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {issues.filter((i) => i.projectId === p.id).length}
                      </span>
                    </ToggleGroupItem>
                  ),
                )}
              </ToggleGroup>
            )}
            {foreignProject ? (
              <EpicForeignIssues
                project={foreignProject}
                issues={issues.filter((i) => i.projectId === foreignProject.id)}
              />
            ) : (
              <IssuesView
                issues={ownIssues}
                defaultView={defaultView}
                createDefaults={{ epicId: epic.id }}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function EpicName({
  name,
  canWrite,
  onSave,
}: {
  name: string;
  canWrite: boolean;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useDraft(name);
  const commit = () => {
    const next = draft.trim().slice(0, EPIC_NAME_MAX);
    if (!next) setDraft(name);
    else if (next !== name) onSave(next);
  };
  return (
    <Textarea
      aria-label="Epic name"
      value={draft}
      rows={1}
      maxLength={EPIC_NAME_MAX}
      readOnly={!canWrite}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(name);
          e.currentTarget.blur();
        }
      }}
      className="min-h-0 flex-1 resize-none border-transparent bg-transparent px-1 py-0.5 text-xl font-medium shadow-none hover:border-border dark:bg-transparent"
    />
  );
}

function EpicDescription({
  description,
  canWrite,
  onSave,
}: {
  description: string | null;
  canWrite: boolean;
  onSave: (description: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? '');

  const start = () => {
    setDraft(description ?? '');
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim() ? draft : null;
    if (next !== description) onSave(next);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <RichTextEditor
          autoFocus
          aria-label="Description"
          value={draft}
          onChange={setDraft}
          onSubmit={commit}
          onCancel={() => setEditing(false)}
          placeholder="Describe the goal, scope and plan. Markdown supported."
          maxLength={EPIC_DESCRIPTION_MAX}
        />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted-foreground">⌘Enter to save · Esc to cancel</span>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={commit}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Description" className="group relative">
      {description ? (
        <RichText source={description} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {canWrite ? 'Add a description…' : 'No description.'}
        </p>
      )}
      {canWrite && (
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            'mt-2',
            description && 'absolute -top-1 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
          onClick={start}
        >
          <Pencil />
          {description ? 'Edit' : 'Write description'}
        </Button>
      )}
    </section>
  );
}
