'use client';

import { useRef, useState } from 'react';
import { GitBranch, MoreHorizontal, Trash2, UserRound, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, StatusIcon } from '@/components/ui-icons';
import { IssueStatusMenu } from '@/components/issues/issue-status-menu';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { STATUS_LABEL, type IssueAssignee, type IssueRow } from '@/lib/issue-model';

const UNASSIGNED_VALUE = '__unassigned';
const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Local draft that resets whenever the saved value changes (including an
// optimistic rollback), without an effect.
function useDraft(saved: string) {
  const [draft, setDraft] = useState(saved);
  const [base, setBase] = useState(saved);
  if (saved !== base) {
    setBase(saved);
    setDraft(saved);
  }
  return [draft, setDraft] as const;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function IssueDetail({
  issue,
  members,
  mutations,
  onClose,
}: {
  issue: IssueRow;
  members: IssueAssignee[];
  mutations: IssueMutations;
  onClose: () => void;
}) {
  const [title, setTitle] = useDraft(issue.title);
  const [description, setDescription] = useDraft(issue.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);

  const saveTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(issue.title);
      return;
    }
    if (next !== issue.title) mutations.update(issue, { title: next });
  };

  const saveDescription = () => {
    const next = description.trim();
    if (next !== (issue.description ?? '')) {
      mutations.update(issue, { description: next || null });
    }
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={actionsRef}
                variant="ghost"
                size="icon-sm"
                aria-label="Issue actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete issue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label="Close issue" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <Textarea
        aria-label="Title"
        value={title}
        maxLength={200}
        rows={1}
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

      <div className="flex flex-col gap-1 border-y border-border py-3">
        <PropertyRow label="Status">
          <IssueStatusMenu
            status={issue.status}
            onChange={(status) => mutations.setStatus(issue, status)}
          >
            <Button variant="ghost" size="sm" className="-ml-2 gap-2 font-normal">
              <StatusIcon status={issue.status} size={14} />
              {STATUS_LABEL[issue.status]}
            </Button>
          </IssueStatusMenu>
        </PropertyRow>

        <PropertyRow label="Assignee">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 gap-2 font-normal">
                {issue.assignee ? (
                  <>
                    <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
                    <span className="truncate">{issue.assignee.name}</span>
                  </>
                ) : (
                  <>
                    <UserRound className="text-muted-foreground" />
                    <span className="text-muted-foreground">Unassigned</span>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuRadioGroup
                value={issue.assignee?.id ?? UNASSIGNED_VALUE}
                onValueChange={(value) =>
                  mutations.assign(
                    issue,
                    value === UNASSIGNED_VALUE
                      ? null
                      : (members.find((m) => m.id === value) ?? null),
                  )
                }
              >
                <DropdownMenuRadioItem value={UNASSIGNED_VALUE}>
                  Unassigned
                </DropdownMenuRadioItem>
                {members.length > 0 && <DropdownMenuSeparator />}
                {members.map((member) => (
                  <DropdownMenuRadioItem key={member.id} value={member.id}>
                    <Avatar name={member.name} src={member.image} size={20} />
                    <span className="truncate">{member.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </PropertyRow>

        {issue.githubBranch && (
          <PropertyRow label="Branch">
            <span className="flex items-center gap-1.5 truncate font-mono text-xs">
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              {issue.githubBranch}
            </span>
          </PropertyRow>
        )}

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

      <Textarea
        aria-label="Description"
        value={description}
        placeholder="Add a description…"
        maxLength={10_000}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={saveDescription}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="min-h-32 resize-none border-transparent bg-transparent px-1 shadow-none hover:border-border dark:bg-transparent"
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            actionsRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {issue.key}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{issue.title}” will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => mutations.remove(issue, onClose)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
