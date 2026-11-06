<!--
  Per-issue keyboard shortcuts and palette commands for the
  focused row / card or the open issue, the fallback new-issue dialog, and the
  `?create=1` / `?draft=<id>` / `?template=<id>` entry points. Rendered by
  IssuesView and the issue permalink page.
-->
<script lang="ts">
  import { untrack, type ComponentProps } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { getDraft } from '@/lib/actions/drafts';
  import NewIssueDialog from '@/lib/components/issues/new-issue-dialog.svelte';
  import { ISSUE_ITEM, focusedIssueId, focusedIssueRowId, issueIdOf } from '@/lib/components/issues/issue-dom';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import {
    copyIssueId,
    copyIssueLink,
    copyIssueMarkdown,
    duplicateInput,
  } from '@/lib/components/productivity/issue-actions';
  import IssueCommandDialog from '@/lib/components/productivity/issue-command-dialog.svelte';
  import {
    CREATE_PARAM,
    DRAFT_PARAM,
    TEMPLATE_PARAM,
    requestNewIssue,
  } from '@/lib/components/productivity/new-issue-bus.svelte';
  import { templateProps, useTemplates } from '@/lib/components/productivity/templates-store.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { afterFrame, afterTask } from '@/lib/svelte/focus';
  import { OPEN_LAYER_SELECTOR, hasOpenLayer, registerHotkeys, type Hotkey } from '@/lib/svelte/hotkeys.svelte';
  import { registerPaletteCommands, type PaletteCommand } from '@/lib/svelte/palette-commands.svelte';
  import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
  import type { IssueRow } from '@/lib/issue-model';

  type IssueCommand = NonNullable<ComponentProps<typeof IssueCommandDialog>['command']>;

  type PaletteAction =
    | IssueCommand
    | 'assignMe'
    | 'copyId'
    | 'copyLink'
    | 'copyMarkdown'
    | 'duplicate'
    | 'archive'
    | 'trash';

  let {
    mutations,
    selectedIssue,
  }: {
    issues: IssueRow[];
    mutations: IssueMutations;
    /** The issue open in the detail pane / permalink page, if any. */
    selectedIssue: IssueRow | null;
  } = $props();

  /** Palette `run`: let the palette close (and restore focus) before a dialog opens. */
  const runLater = (fn: () => void) => () => {
    afterTask(fn);
  };

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const searchParams = useSearchParams();
  const templates = useTemplates(
    () => data.project.id,
    () => canWrite.current,
  );

  let command = $state.raw<{ kind: IssueCommand; id: string } | null>(null);
  let trashId = $state<string | null>(null);
  let createOpen = $state(false);
  // Palette target: the last focused row / card (focus moves into the palette
  // when it opens, so "currently focused" would always be empty there).
  let stickyId = $state<string | null>(null);

  const find = (id: string | null): IssueRow | null =>
    id ? (mutations.issues.find((i) => i.id === id) ?? (selectedIssue?.id === id ? selectedIssue : null)) : null;
  const hasEstimates = $derived(data.project.estimateScale !== 'none');

  // ------------------------------------------------------------------ hotkeys

  const target = () => find(focusedIssueId()) ?? selectedIssue;
  const open = (kind: IssueCommand, issue: IssueRow) => {
    command = { kind, id: issue.id };
  };
  const act = (action: 'assignMe' | 'trash' | 'archive' | 'copyId' | 'copyLink') => {
    const issue = target();
    if (!issue) return;
    if (action === 'assignMe') mutations.update(issue, { assigneeId: data.viewer.id });
    else if (action === 'trash') trashId = issue.id;
    else if (action === 'archive') mutations.archive(issue);
    else if (action === 'copyId') void copyIssueId(issue);
    else void copyIssueLink(issue);
  };

  $effect(() => {
    const writer = canWrite.current;
    const estimates = hasEstimates;
    return untrack(() => {
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
      if (writer) {
        keys.unshift(
          {
            // The list binds `s` for its focused / cursor row (inline menu); this
            // one covers board cards and the open issue.
            ...edit('s', 'status', 'Change status'),
            when: (event) => has(event) && !focusedIssueRowId(),
            handler: () => {
              const issue = target();
              if (!issue) return;
              // If the list opened its own status menu for its cursor row, stand down.
              afterFrame(() => {
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
          ...(estimates ? [edit('e', 'estimate', 'Set estimate')] : []),
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
    });
  });

  // ------------------------------------------------------------------ palette

  $effect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const row = event.target.closest<HTMLElement>(ISSUE_ITEM);
      if (row) stickyId = issueIdOf(row);
      else if (!event.target.closest(OPEN_LAYER_SELECTOR)) stickyId = null;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  });

  const paletteIssue = $derived(find(stickyId) ?? selectedIssue);
  // Commands carry the id they were registered for: closing the palette moves
  // focus (clearing the sticky target) before the deferred `run` fires.
  const onPaletteCommand = (kind: PaletteAction, id: string) => {
    const issue = find(id);
    if (!issue) return;
    switch (kind) {
      case 'assignMe':
        return mutations.update(issue, { assigneeId: data.viewer.id });
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
        trashId = issue.id;
        return;
      default:
        command = { kind, id: issue.id };
    }
  };

  const paletteId = $derived(paletteIssue?.id ?? null);
  const paletteKey = $derived(paletteIssue?.key ?? null);
  const assignedToMe = $derived(paletteIssue?.assignee?.id === data.viewer.id);
  $effect(() => {
    const id = paletteId;
    const key = paletteKey;
    const writer = canWrite.current;
    const estimates = hasEstimates;
    const mine = assignedToMe;
    if (!id || !key) return;
    return untrack(() => {
      const section = `Issue ${key}`;
      const cmd = (cmdId: string, label: string, kind: PaletteAction, keywords: string[] = []): PaletteCommand => ({
        id: `b10-issue-${cmdId}`,
        label,
        section,
        keywords: [key, ...keywords],
        // Clipboard writes stay inside the user gesture (Safari); the rest wait
        // for the palette to close.
        run: kind.startsWith('copy') ? () => onPaletteCommand(kind, id) : runLater(() => onPaletteCommand(kind, id)),
      });
      const commands: PaletteCommand[] = [];
      if (writer) {
        commands.push(
          cmd('status', 'Change status…', 'status', ['state', 'workflow']),
          cmd('priority', 'Set priority…', 'priority', ['urgent', 'high']),
          cmd('assignee', 'Assign to…', 'assignee', ['assignee', 'owner']),
          ...(mine ? [] : [cmd('assign-me', 'Assign to me', 'assignMe', ['self', 'mine'])]),
          cmd('labels', 'Add labels…', 'labels', ['tag', 'label']),
          ...(estimates ? [cmd('estimate', 'Set estimate…', 'estimate', ['points'])] : []),
          cmd('due', 'Set due date…', 'dueDate', ['deadline', 'date']),
        );
      }
      commands.push(
        cmd('copy-id', 'Copy ID', 'copyId', ['clipboard', 'key']),
        cmd('copy-link', 'Copy link', 'copyLink', ['clipboard', 'url', 'permalink']),
        cmd('copy-markdown', 'Copy as markdown link', 'copyMarkdown', ['clipboard']),
      );
      if (writer) {
        commands.push(
          cmd('duplicate', 'Duplicate issue', 'duplicate', ['copy', 'clone']),
          cmd('archive', 'Archive', 'archive'),
          cmd('trash', 'Move to trash…', 'trash', ['delete', 'remove']),
        );
      }
      return registerPaletteCommands(commands);
    });
  });

  // "New issue from template: …"
  $effect(() => {
    const list = templates.current;
    if (!canWrite.current || !list?.length) return;
    return untrack(() =>
      registerPaletteCommands(
        list.map((template) => ({
          id: `b10-template-${template.id}`,
          label: `New issue from template: ${template.name}`,
          section: 'Templates',
          keywords: ['create', 'template', template.name],
          run: () =>
            afterTask(() =>
              requestNewIssue({
                title: template.title,
                description: template.description,
                props: templateProps(template, data),
              }),
            ),
        })),
      ),
    );
  });

  // ------------------------------------------------ ?create / ?draft / ?template

  const draftParam = $derived(searchParams.get(DRAFT_PARAM));
  const templateParam = $derived(searchParams.get(TEMPLATE_PARAM));
  const createParam = $derived(searchParams.get(CREATE_PARAM));
  $effect(() => {
    const draft = draftParam;
    const templateId = templateParam;
    const create = createParam;
    const writer = canWrite.current;
    const list = templates.current;
    if (!draft && !templateId && !create) return;
    // Wait for the template list before consuming ?template.
    if (writer && templateId && !draft && list === undefined) return;

    untrack(() => {
      // Strip the entry params in place.
      setSearchParams({ [DRAFT_PARAM]: null, [TEMPLATE_PARAM]: null, [CREATE_PARAM]: null });
      if (!writer) return;

      // Deferred: every dialog on the page has registered as a host by then.
      if (draft) {
        getDraft({ projectId: data.project.id, id: draft })
          .then((result) => {
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            const { draft: saved } = result;
            requestNewIssue({
              title: saved.title,
              description: saved.description,
              props: saved.data,
              draftId: saved.id,
            });
          })
          .catch(() => toast.error('Could not open the draft.'));
      } else if (templateId) {
        const template = list?.find((t) => t.id === templateId);
        afterTask(() =>
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
        afterTask(() => requestNewIssue());
      }
    });
  });

  // ------------------------------------------------------------------ render

  const commandIssue = $derived(command ? find(command.id) : null);
  const trashIssue = $derived(find(trashId));
</script>

<IssueCommandDialog
  command={commandIssue && command ? command.kind : null}
  issue={commandIssue}
  {mutations}
  onClose={() => (command = null)}
/>

<AlertDialog
  open={trashIssue !== null}
  onOpenChange={(next: boolean) => {
    if (!next) trashId = null;
  }}
>
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
        onclick={() => {
          if (trashIssue) mutations.remove(trashIssue);
          trashId = null;
        }}
      >
        Move to trash
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

{#if canWrite.current}
  <NewIssueDialog
    fallback
    open={createOpen}
    onOpenChange={(next) => (createOpen = next)}
    onCreate={mutations.create}
  />
{/if}
