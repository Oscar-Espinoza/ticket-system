'use client';

// Slot — owned by B10. Per-issue keyboard shortcuts and palette commands for the
// focused row / card or the open issue, the fallback new-issue dialog, and the
// `?create=1` / `?draft=<id>` / `?template=<id>` entry points. Rendered by
// IssuesView and the issue permalink page.

import { useEffect, useEffectEvent, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { getDraft } from '@/app/actions/drafts';
import { NewIssueDialog } from '@/components/issues/new-issue-dialog';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import {
  copyIssueId,
  copyIssueLink,
  copyIssueMarkdown,
  duplicateInput,
  focusedIssueId,
} from '@/components/productivity/issue-actions';
import {
  IssueCommandDialog,
  type IssueCommand,
} from '@/components/productivity/issue-command-dialog';
import {
  CREATE_PARAM,
  DRAFT_PARAM,
  TEMPLATE_PARAM,
  requestNewIssue,
} from '@/components/productivity/new-issue-bus';
import { templateProps, useTemplates } from '@/components/productivity/templates-store';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
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
import { registerHotkeys, type Hotkey } from '@/lib/hotkeys';
import type { IssueRow } from '@/lib/issue-model';
import { registerPaletteCommands, type PaletteCommand } from '@/lib/palette-commands';

const LAYER =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]';
const hasOpenLayer = () => !!document.querySelector(LAYER);

type PaletteAction =
  | IssueCommand
  | 'assignMe'
  | 'copyId'
  | 'copyLink'
  | 'copyMarkdown'
  | 'duplicate'
  | 'archive'
  | 'trash';

/** Palette `run`: let the palette close (and restore focus) before a dialog opens. */
const runLater = (fn: () => void) => () => {
  setTimeout(fn, 0);
};

export function IssueShortcuts({
  mutations,
  selectedIssue,
}: {
  issues: IssueRow[];
  mutations: IssueMutations;
  /** The issue open in the detail pane / permalink page, if any. */
  selectedIssue: IssueRow | null;
}) {
  const data = useProjectData();
  const { project, viewer } = data;
  const canWrite = useProjectPermission('write');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const templates = useTemplates(project.id, canWrite);

  const [command, setCommand] = useState<{ kind: IssueCommand; id: string } | null>(null);
  const [trashId, setTrashId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Palette target: the last focused row / card (focus moves into the palette
  // when it opens, so "currently focused" would always be empty there).
  const [stickyId, setStickyId] = useState<string | null>(null);

  const find = (id: string | null): IssueRow | null =>
    id
      ? (mutations.issues.find((i) => i.id === id) ??
        (selectedIssue?.id === id ? selectedIssue : null))
      : null;
  const hasEstimates = project.estimateScale !== 'none';

  // ------------------------------------------------------------------ hotkeys

  const target = useEffectEvent(() => find(focusedIssueId()) ?? selectedIssue);
  const open = useEffectEvent((kind: IssueCommand, issue: IssueRow) =>
    setCommand({ kind, id: issue.id }),
  );
  const act = useEffectEvent((action: 'assignMe' | 'trash' | 'archive' | 'copyId' | 'copyLink') => {
    const issue = target();
    if (!issue) return;
    if (action === 'assignMe') mutations.update(issue, { assigneeId: viewer.id });
    else if (action === 'trash') setTrashId(issue.id);
    else if (action === 'archive') mutations.archive(issue);
    else if (action === 'copyId') void copyIssueId(issue);
    else void copyIssueLink(issue);
  });

  useEffect(() => {
    // Bare-letter keys ignore Shift in the registry, so they stand down for it:
    // ⇧A / ⇧D are separate shortcuts below.
    const hasTarget = () => target() !== null;
    const has = (event: KeyboardEvent) => !event.shiftKey && hasTarget();
    const edit = (key: string, kind: IssueCommand, description: string): Hotkey => ({
      key,
      scope: 'Issue',
      description,
      when: has,
      handler: () => {
        const issue = target();
        if (issue) open(kind, issue);
      },
    });

    const keys: Hotkey[] = [
      {
        mod: true,
        key: '.',
        scope: 'Issue',
        description: 'Copy issue ID',
        when: has,
        handler: () => act('copyId'),
      },
      {
        mod: true,
        shift: true,
        key: ',',
        scope: 'Issue',
        description: 'Copy issue link',
        when: hasTarget,
        handler: () => act('copyLink'),
      },
    ];
    if (canWrite) {
      keys.unshift(
        {
          // The list binds `s` for its focused / cursor row (inline menu); this
          // one covers board cards and the open issue.
          ...edit('s', 'status', 'Change status'),
          when: (event) => has(event) && !document.activeElement?.closest('[data-issue-row]'),
          handler: () => {
            const issue = target();
            if (!issue) return;
            // If the list opened its own status menu for its cursor row, stand down.
            requestAnimationFrame(() => {
              if (!hasOpenLayer()) open('status', issue);
            });
          },
        },
        edit('p', 'priority', 'Set priority'),
        edit('a', 'assignee', 'Assign to…'),
        {
          key: 'i',
          scope: 'Issue',
          description: 'Assign to me',
          when: has,
          handler: () => act('assignMe'),
        },
        edit('l', 'labels', 'Change labels'),
        ...(hasEstimates ? [edit('e', 'estimate', 'Set estimate')] : []),
        { ...edit('d', 'dueDate', 'Set due date'), shift: true, when: hasTarget },
        {
          key: 'a',
          shift: true,
          scope: 'Issue',
          description: 'Archive issue',
          when: hasTarget,
          handler: () => act('archive'),
        },
        {
          mod: true,
          key: 'Backspace',
          scope: 'Issue',
          description: 'Move issue to trash',
          when: (event) => has(event) && !hasOpenLayer(),
          handler: () => act('trash'),
        },
      );
    }
    return registerHotkeys(keys);
  }, [canWrite, hasEstimates]);

  // ------------------------------------------------------------------ palette

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const row = event.target.closest<HTMLElement>('[data-issue-row], [data-board-card]');
      if (row) setStickyId(row.dataset.issueRow ?? row.dataset.boardCard ?? null);
      else if (!event.target.closest(LAYER)) setStickyId(null);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const paletteIssue = find(stickyId) ?? selectedIssue;
  // Commands carry the id they were registered for: closing the palette moves
  // focus (clearing the sticky target) before the deferred `run` fires.
  const onPaletteCommand = useEffectEvent((kind: PaletteAction, id: string) => {
    const issue = find(id);
    if (!issue) return;
    switch (kind) {
      case 'assignMe':
        return mutations.update(issue, { assigneeId: viewer.id });
      case 'copyId':
        return void copyIssueId(issue);
      case 'copyLink':
        return void copyIssueLink(issue);
      case 'copyMarkdown':
        return void copyIssueMarkdown(issue);
      case 'duplicate':
        return mutations.create(duplicateInput(issue));
      case 'archive':
        return mutations.archive(issue);
      case 'trash':
        return setTrashId(issue.id);
      default:
        return setCommand({ kind, id: issue.id });
    }
  });

  const paletteId = paletteIssue?.id ?? null;
  const paletteKey = paletteIssue?.key ?? null;
  const assignedToMe = paletteIssue?.assignee?.id === viewer.id;
  useEffect(() => {
    if (!paletteId || !paletteKey) return;
    const section = `Issue ${paletteKey}`;
    const cmd = (
      id: string,
      label: string,
      kind: PaletteAction,
      keywords: string[] = [],
    ): PaletteCommand => ({
      id: `b10-issue-${id}`,
      label,
      section,
      keywords: [paletteKey, ...keywords],
      // Clipboard writes stay inside the user gesture (Safari); the rest wait
      // for the palette to close.
      run: kind.startsWith('copy')
        ? () => onPaletteCommand(kind, paletteId)
        : runLater(() => onPaletteCommand(kind, paletteId)),
    });
    const commands: PaletteCommand[] = [];
    if (canWrite) {
      commands.push(
        cmd('status', 'Change status…', 'status', ['state', 'workflow']),
        cmd('priority', 'Set priority…', 'priority', ['urgent', 'high']),
        cmd('assignee', 'Assign to…', 'assignee', ['assignee', 'owner']),
        ...(assignedToMe ? [] : [cmd('assign-me', 'Assign to me', 'assignMe', ['self', 'mine'])]),
        cmd('labels', 'Add labels…', 'labels', ['tag', 'label']),
        ...(hasEstimates ? [cmd('estimate', 'Set estimate…', 'estimate', ['points'])] : []),
        cmd('due', 'Set due date…', 'dueDate', ['deadline', 'date']),
      );
    }
    commands.push(
      cmd('copy-id', 'Copy ID', 'copyId', ['clipboard', 'key']),
      cmd('copy-link', 'Copy link', 'copyLink', ['clipboard', 'url', 'permalink']),
      cmd('copy-markdown', 'Copy as markdown link', 'copyMarkdown', ['clipboard']),
    );
    if (canWrite) {
      commands.push(
        cmd('duplicate', 'Duplicate issue', 'duplicate', ['copy', 'clone']),
        cmd('archive', 'Archive', 'archive'),
        cmd('trash', 'Move to trash…', 'trash', ['delete', 'remove']),
      );
    }
    return registerPaletteCommands(commands);
  }, [paletteId, paletteKey, canWrite, hasEstimates, assignedToMe]);

  // "New issue from template: …"
  useEffect(() => {
    if (!canWrite || !templates?.length) return;
    return registerPaletteCommands(
      templates.map((template) => ({
        id: `b10-template-${template.id}`,
        label: `New issue from template: ${template.name}`,
        section: 'Templates',
        keywords: ['create', 'template', template.name],
        run: () =>
          setTimeout(() =>
            requestNewIssue({
              title: template.title,
              description: template.description,
              props: templateProps(template, data),
            }),
          ),
      })),
    );
  }, [canWrite, templates, data]);

  // ------------------------------------------------ ?create / ?draft / ?template

  const draftParam = searchParams.get(DRAFT_PARAM);
  const templateParam = searchParams.get(TEMPLATE_PARAM);
  const createParam = searchParams.get(CREATE_PARAM);
  useEffect(() => {
    if (!draftParam && !templateParam && !createParam) return;
    // Wait for the template list before consuming ?template.
    if (canWrite && templateParam && !draftParam && templates === undefined) return;

    const next = new URLSearchParams(window.location.search);
    [DRAFT_PARAM, TEMPLATE_PARAM, CREATE_PARAM].forEach((param) => next.delete(param));
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    if (!canWrite) return;

    // Deferred: every dialog on the page has registered as a host by then.
    if (draftParam) {
      getDraft({ projectId: project.id, id: draftParam })
        .then((result) => {
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const { draft } = result;
          requestNewIssue({
            title: draft.title,
            description: draft.description,
            props: draft.data,
            draftId: draft.id,
          });
        })
        .catch(() => toast.error('Could not open the draft.'));
    } else if (templateParam) {
      const template = templates?.find((t) => t.id === templateParam);
      setTimeout(() =>
        requestNewIssue(
          template
            ? {
                title: template.title,
                description: template.description,
                props: templateProps(template, data),
              }
            : undefined,
        ),
      );
    } else {
      setTimeout(() => requestNewIssue());
    }
  }, [canWrite, draftParam, templateParam, createParam, templates, data, project.id, pathname, router]);

  // ------------------------------------------------------------------ render

  const commandIssue = command ? find(command.id) : null;
  const trashIssue = find(trashId);

  return (
    <>
      <IssueCommandDialog
        command={commandIssue ? command!.kind : null}
        issue={commandIssue}
        mutations={mutations}
        onClose={() => setCommand(null)}
      />

      <AlertDialog open={trashIssue !== null} onOpenChange={(next) => !next && setTrashId(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Move {trashIssue?.key} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {trashIssue?.title} — you can restore it from the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (trashIssue) mutations.remove(trashIssue);
                setTrashId(null);
              }}
            >
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canWrite && (
        <NewIssueDialog
          fallback
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={mutations.create}
        />
      )}
    </>
  );
}
