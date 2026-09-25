'use client';

// Issue detail — rendered in the list's side pane ('pane') and on the
// permalink page ('page', B6). The header, properties panel and sections host
// slot components owned by Wave B agents; this host's layout is frozen.

import type { ComponentProps, ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  GitBranch,
  Hash,
  Link2,
  MoreHorizontal,
  Tag,
  Trash2,
  Triangle,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AssigneePicker,
  DueDatePicker,
  EstimatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
} from '@/components/issue-pickers';
import { DueDateChip, LabelChips } from '@/components/issues/issue-properties';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { formatEstimate } from '@/lib/estimates';
import { formatHotkey } from '@/lib/hotkeys';
import { issueUrl } from '@/lib/issue-links';
import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { PropertyRow } from './property-row';
import { useDraft } from './use-draft';
import { DescriptionEditor } from './slots/description-editor';
import { HeaderFavorite } from './slots/header-favorite';
import { HeaderGithub } from './slots/header-github';
import { HeaderPresence } from './slots/header-presence';
import { HeaderRemind } from './slots/header-remind';
import { HeaderSubscribe } from './slots/header-subscribe';
import { MenuExtraItems } from './slots/menu-extra-items';
import { PropertyCycle } from './slots/property-cycle';
import { PropertyEpic } from './slots/property-epic';
import { PropertyParent } from './slots/property-parent';
import { SectionActivity } from './slots/section-activity';
import { SectionAttachments } from './slots/section-attachments';
import { SectionPullRequests } from './slots/section-pull-requests';
import { SectionRelations } from './slots/section-relations';
import { SectionSubIssues } from './slots/section-sub-issues';

// Menu hints for the shortcuts IssueShortcuts registers (B10).
const COPY_LINK_KEY = { mod: true, shift: true, key: ',' };
const COPY_ID_KEY = { mod: true, key: '.' };

const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Ghost property button; trigger props (ref, onClick, aria-*) come via asChild. */
function PropertyButton({ className, ...props }: ComponentProps<typeof Button>) {
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

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Could not copy to the clipboard.');
  }
}

export function IssueDetail({
  issue,
  mutations,
  variant = 'pane',
  onClose,
}: {
  issue: IssueRow;
  mutations: IssueMutations;
  /** 'pane' = narrow single column; 'page' = content + properties sidebar. */
  variant?: 'pane' | 'page';
  /** Shows the close button and runs after archive / trash. */
  onClose?: () => void;
}) {
  const { project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const [title, setTitle] = useDraft(issue.title);
  const update = (patch: Parameters<IssueMutations['update']>[1]) => mutations.update(issue, patch);

  const saveTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(issue.title);
      return;
    }
    if (next !== issue.title) update({ title: next });
  };

  const header = (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
      <div className="ml-auto flex items-center gap-1">
        <HeaderPresence issue={issue} mutations={mutations} />
        <HeaderFavorite issue={issue} mutations={mutations} />
        <HeaderSubscribe issue={issue} mutations={mutations} />
        <HeaderRemind issue={issue} mutations={mutations} />
        <HeaderGithub issue={issue} mutations={mutations} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Issue actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => copy(issueUrl(project.id, issue.key), 'link')}>
              <Link2 />
              Copy link
              <DropdownMenuShortcut>{formatHotkey(COPY_LINK_KEY)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copy(issue.key, issue.key)}>
              <Hash />
              Copy ID
              <DropdownMenuShortcut>{formatHotkey(COPY_ID_KEY)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <MenuExtraItems issue={issue} mutations={mutations} />
            {canWrite && (
              <>
                <DropdownMenuSeparator />
                {issue.archivedAt || issue.deletedAt ? (
                  <DropdownMenuItem onSelect={() => mutations.restore(issue)}>
                    <ArchiveRestore />
                    Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => mutations.archive(issue, onClose)}>
                    <Archive />
                    Archive
                  </DropdownMenuItem>
                )}
                {!issue.deletedAt && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => mutations.remove(issue, onClose)}
                  >
                    <Trash2 />
                    Move to trash
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Close issue" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>
    </div>
  );

  const banner = (issue.archivedAt || issue.deletedAt) && (
    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      {issue.deletedAt ? <Trash2 className="size-4" /> : <Archive className="size-4" />}
      <span>{issue.deletedAt ? 'This issue is in the trash.' : 'This issue is archived.'}</span>
      {canWrite && (
        <Button size="xs" variant="outline" className="ml-auto" onClick={() => mutations.restore(issue)}>
          Restore
        </Button>
      )}
    </div>
  );

  const titleField = (
    <Textarea
      aria-label="Title"
      value={title}
      maxLength={200}
      rows={1}
      readOnly={!canWrite}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={saveTitle}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setTitle(issue.title);
          e.currentTarget.blur();
        }
      }}
      className="min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 text-lg font-medium shadow-none hover:border-border dark:bg-transparent"
    />
  );

  // Read-only roles (guests) see the same buttons, disabled, without pickers.
  const picker = (trigger: ReactNode, wrap: (trigger: ReactNode) => ReactNode) =>
    canWrite ? wrap(trigger) : trigger;

  const properties = (
    <div className="flex flex-col gap-1">
      <PropertyRow label="Status">
        {picker(
          <PropertyButton disabled={!canWrite}>
            <StateIcon state={issue.state} size={14} />
            <span className="truncate">{issue.state.name}</span>
          </PropertyButton>,
          (trigger) => (
            <StatePicker value={issue.stateId} onChange={(stateId) => update({ stateId })}>
              {trigger}
            </StatePicker>
          ),
        )}
      </PropertyRow>

      <PropertyRow label="Priority">
        {picker(
          <PropertyButton disabled={!canWrite}>
            <PriorityIcon priority={issue.priority} size={14} />
            {issue.priority === 'none' ? <Muted>Set priority</Muted> : PRIORITY_LABEL[issue.priority]}
          </PropertyButton>,
          (trigger) => (
            <PriorityPicker value={issue.priority} onChange={(priority) => update({ priority })}>
              {trigger}
            </PriorityPicker>
          ),
        )}
      </PropertyRow>

      <PropertyRow label="Assignee">
        {picker(
          <PropertyButton disabled={!canWrite}>
            {issue.assignee ? (
              <>
                <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
                <span className="truncate">{issue.assignee.name}</span>
              </>
            ) : (
              <>
                <UserRound className="text-muted-foreground" />
                <Muted>Unassigned</Muted>
              </>
            )}
          </PropertyButton>,
          (trigger) => (
            <AssigneePicker
              value={issue.assignee?.id ?? null}
              onChange={(assigneeId) => update({ assigneeId })}
            >
              {trigger}
            </AssigneePicker>
          ),
        )}
      </PropertyRow>

      <PropertyRow label="Labels">
        {picker(
          <PropertyButton disabled={!canWrite} className="h-auto min-h-7 py-1">
            {issue.labels.length > 0 ? (
              <LabelChips labels={issue.labels} max={6} className="flex-wrap" />
            ) : (
              <>
                <Tag className="text-muted-foreground" />
                <Muted>Add label</Muted>
              </>
            )}
          </PropertyButton>,
          (trigger) => (
            <LabelPicker
              value={issue.labels.map((l) => l.id)}
              onChange={(labelIds) => update({ labelIds })}
            >
              {trigger}
            </LabelPicker>
          ),
        )}
      </PropertyRow>

      {project.estimateScale !== 'none' && (
        <PropertyRow label="Estimate">
          {picker(
            <PropertyButton disabled={!canWrite}>
              <Triangle className="text-muted-foreground" />
              {issue.estimate === null ? (
                <Muted>Set estimate</Muted>
              ) : (
                formatEstimate(project.estimateScale, issue.estimate)
              )}
            </PropertyButton>,
            (trigger) => (
              <EstimatePicker value={issue.estimate} onChange={(estimate) => update({ estimate })}>
                {trigger}
              </EstimatePicker>
            ),
          )}
        </PropertyRow>
      )}

      <PropertyRow label="Due date">
        {picker(
          <PropertyButton disabled={!canWrite}>
            {issue.dueDate ? (
              <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} className="border-0 px-0" />
            ) : (
              <>
                <CalendarDays className="text-muted-foreground" />
                <Muted>Set due date</Muted>
              </>
            )}
          </PropertyButton>,
          (trigger) => (
            <DueDatePicker value={issue.dueDate} onChange={(dueDate) => update({ dueDate })}>
              {trigger}
            </DueDatePicker>
          ),
        )}
      </PropertyRow>

      <PropertyParent issue={issue} mutations={mutations} />
      <PropertyCycle issue={issue} mutations={mutations} />
      <PropertyEpic issue={issue} mutations={mutations} />

      {issue.githubBranch && (
        <PropertyRow label="Branch">
          <span className="flex items-center gap-1.5 truncate font-mono text-xs">
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            {issue.githubBranch}
          </span>
        </PropertyRow>
      )}

      <PropertyRow label="Created by">
        {issue.creator ? (
          <span className="flex items-center gap-2 text-xs">
            <Avatar name={issue.creator.name} src={issue.creator.image} size={20} />
            <span className="truncate">{issue.creator.name}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </PropertyRow>
      <PropertyRow label="Created">
        <span className="text-xs" suppressHydrationWarning>
          {dateFormat.format(new Date(issue.createdAt))}
        </span>
      </PropertyRow>
      <PropertyRow label="Updated">
        <span className="text-xs" suppressHydrationWarning>
          {dateFormat.format(new Date(issue.updatedAt))}
        </span>
      </PropertyRow>
    </div>
  );

  const sections = (
    <>
      <DescriptionEditor issue={issue} mutations={mutations} readOnly={!canWrite} />
      <SectionSubIssues issue={issue} mutations={mutations} />
      <SectionRelations issue={issue} mutations={mutations} />
      <SectionAttachments issue={issue} mutations={mutations} />
      <SectionPullRequests issue={issue} mutations={mutations} />
      <SectionActivity issue={issue} mutations={mutations} />
    </>
  );

  if (variant === 'page') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {banner}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-5">
            {titleField}
            {sections}
          </div>
          <aside aria-label="Properties" className="lg:border-l lg:border-border lg:pl-6">
            {properties}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {header}
      {banner}
      {titleField}
      <div className="border-y border-border py-3">{properties}</div>
      {sections}
    </div>
  );
}
