<!--
  One project document: breadcrumb + actions, icon, title, epic, and a
  full-width collaborative editor (Yjs key `doc:<id>`, see
  D2-collaborative-editing.md) whose markdown snapshot is saved to
  `document.content` 1.5 s after local typing stops. "Mentioned in" lists the
  issues whose description links here. Guests and archived docs are read-only.
  Port of document-view.tsx; mount it inside {#key document.id} (React keyed it
  by id: switching docs must never reuse the previous doc's editor).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Editor } from '@tiptap/core';
  import Archive from '@lucide/svelte/icons/archive';
  import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Download from '@lucide/svelte/icons/download';
  import Link2 from '@lucide/svelte/icons/link-2';
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { archiveDocument, unarchiveDocument, updateDocument } from '@/lib/actions/documents';
  import {
    TITLE_MAX,
    documentsPath,
    downloadMarkdown,
    type DocumentBacklink,
    type DocumentDetail,
  } from '@/components/documents/document-model';
  import { epicPath } from '@/components/epics/epic-model';
  import CollabAvatars from '@/lib/components/collab/collab-avatars.svelte';
  import CollabStatusBadge from '@/lib/components/collab/collab-status-badge.svelte';
  import { collabColor, useCollab, useCollabPeers } from '@/lib/components/collab/use-collab.svelte';
  import { relativeTime } from '@/lib/components/comments/relative-time';
  import { serializeMarkdown } from '@/lib/components/editor/rich-editor.svelte';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import EpicPicker from '@/lib/components/epics/epic-picker.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { StatusIcon } from '@/lib/components/ui-icons';
  import { docCollabKey } from '@/lib/collab/codec';
  import { issuePath } from '@/lib/issue-links';
  import type { StateType } from '@/lib/issue-model';
  import { copyDocumentLink } from './documents-list.svelte';
  import DeleteDocumentDialog from './delete-document-dialog.svelte';
  import DocumentBody from './document-body.svelte';
  import DocumentIcon from './document-icon.svelte';
  import IconPicker from './icon-picker.svelte';

  let { document: doc, backlinks }: { document: DocumentDetail; backlinks: DocumentBacklink[] } = $props();

  const data = useProjectData();
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current && !doc.archivedAt);
  const canManage = $derived(canWritePermission.current);
  // useState(doc.…): the first values only (the page is keyed by doc id).
  let title = $state(untrack(() => doc.title));
  let icon = $state(untrack(() => doc.icon));
  let epicId = $state(untrack(() => doc.epic?.id ?? null));
  let deleting = $state(false);
  let editorRef: Editor | null = null;

  async function patch(input: Parameters<typeof updateDocument>[0], rollback: () => void) {
    const result = await updateDocument(input);
    if (!result.ok) {
      rollback();
      toast.error(result.error);
    }
  }

  function saveTitle() {
    const next = title.replace(/\s+/g, ' ').trim() || 'Untitled';
    title = next;
    if (next === doc.title) return;
    void patch({ id: doc.id, title: next }, () => (title = doc.title));
  }

  function pickIcon(next: string | null) {
    const prev = icon;
    icon = next;
    void patch({ id: doc.id, icon: next }, () => (icon = prev));
  }

  function pickEpic(next: string | null) {
    const prev = epicId;
    epicId = next;
    void patch({ id: doc.id, epicId: next }, () => (epicId = prev));
  }

  const epic = $derived(data.epics.find((e) => e.id === epicId) ?? (doc.epic?.id === epicId ? doc.epic : null));

  function exportMarkdown() {
    const editor = editorRef;
    downloadMarkdown(title, editor && !editor.isDestroyed ? serializeMarkdown(editor) : doc.content);
  }

  // The action wrappers refresh the page (React: router.refresh()).
  async function setArchived(archived: boolean) {
    const result = archived ? await archiveDocument({ id: doc.id }) : await unarchiveDocument({ id: doc.id });
    if (!result.ok) toast.error(result.error);
    else toast.success(archived ? 'Document archived' : 'Document restored');
  }

  const collab = useCollab(
    () => docCollabKey(doc.id),
    () => ({ id: data.viewer.id, name: data.viewer.name, image: data.viewer.image, color: collabColor(data.viewer.id) }),
  );
  const peers = useCollabPeers(
    () => collab.provider,
    () => data.viewer.id,
  );
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-4 flex min-h-8 items-center gap-2 text-sm">
    <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1 text-muted-foreground">
      <a href={documentsPath(doc.projectId)} class="rounded px-1 hover:text-foreground">Docs</a>
      <ChevronRight class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="flex min-w-0 items-center gap-1.5 text-foreground">
        <DocumentIcon {icon} class="size-3.5 text-xs" />
        <span class="truncate">{title || 'Untitled'}</span>
      </span>
    </nav>
    <div class="ml-auto flex items-center gap-2">
      <CollabStatusBadge snapshot={collab.snapshot} />
      <CollabAvatars peers={peers.current} />
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Document actions">
              <MoreHorizontal />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => copyDocumentLink(doc.projectId, doc.id)}>
            <Link2 />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportMarkdown}>
            <Download />
            Export as Markdown
          </DropdownMenuItem>
          {#if canManage}
            <DropdownMenuSeparator />
            {#if doc.archivedAt}
              <DropdownMenuItem onSelect={() => setArchived(false)}>
                <ArchiveRestore />
                Unarchive
              </DropdownMenuItem>
            {:else}
              <DropdownMenuItem onSelect={() => setArchived(true)}>
                <Archive />
                Archive
              </DropdownMenuItem>
            {/if}
            <DropdownMenuItem variant="destructive" onSelect={() => (deleting = true)}>
              <Trash2 />
              Delete…
            </DropdownMenuItem>
          {/if}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>

  {#if doc.archivedAt}
    <div class="mb-4 flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <Archive class="size-4 text-muted-foreground" aria-hidden="true" />
      <span class="flex-1 text-muted-foreground">
        Archived {relativeTime(new Date(doc.archivedAt))} — read-only until it’s restored.
      </span>
      {#if canManage}
        <Button size="sm" variant="outline" onclick={() => setArchived(false)}>Unarchive</Button>
      {/if}
    </div>
  {/if}

  <article class="mx-auto flex w-full max-w-3xl flex-col gap-2 pb-16">
    <IconPicker {icon} disabled={!canWrite} onChange={pickIcon} />
    <textarea
      bind:value={() => title, (next: string) => (title = next.replace(/\n/g, ''))}
      rows={1}
      maxlength={TITLE_MAX}
      readonly={!canWrite}
      aria-label="Document title"
      placeholder="Untitled"
      onblur={saveTitle}
      onkeydown={(e) => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === title.length)) {
          e.preventDefault();
          saveTitle();
          editorRef?.commands.focus('start');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          title = doc.title;
          e.currentTarget.blur();
        }
      }}
      class="field-sizing-content resize-none bg-transparent text-3xl leading-tight font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
    ></textarea>

    <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {#if canWrite}
        <EpicPicker value={epicId} epics={data.epics} onChange={pickEpic}>
          {#snippet children({ props })}
            <button
              {...props}
              type="button"
              class="flex h-6 items-center gap-1.5 rounded-full border border-border px-2 hover:bg-accent hover:text-foreground"
            >
              <EpicIcon color={epic?.color} class="size-3.5" />
              <span class="max-w-48 truncate">{epic ? epic.name : 'Add to epic'}</span>
            </button>
          {/snippet}
        </EpicPicker>
      {:else if epic}
        <a
          href={epicPath(doc.projectId, epic.id)}
          class="flex h-6 items-center gap-1.5 rounded-full border border-border px-2 hover:bg-accent hover:text-foreground"
        >
          <EpicIcon color={epic.color} class="size-3.5" />
          <span class="max-w-48 truncate">{epic.name}</span>
        </a>
      {/if}
      {#if epic && canWrite}
        <a href={epicPath(doc.projectId, epic.id)} class="hover:text-foreground">Open epic</a>
      {/if}
      <span>
        {doc.updatedBy ? `Edited by ${doc.updatedBy.name} ` : 'Edited '}{relativeTime(new Date(doc.updatedAt))}
      </span>
    </div>

    <DocumentBody
      document={doc}
      {collab}
      hasPeers={peers.current.length > 0}
      {canWrite}
      onEditor={(editor) => {
        editorRef = editor;
      }}
    />

    {#if backlinks.length > 0}
      <section aria-labelledby="doc-backlinks" class="mt-10 flex flex-col gap-1 border-t border-border pt-4">
        <h2 id="doc-backlinks" class="px-1 text-xs font-medium text-muted-foreground">Mentioned in</h2>
        <ul class="flex flex-col">
          {#each backlinks as issue (issue.id)}
            <li>
              <a
                href={issuePath(issue.projectId, issue.key)}
                class="flex h-8 items-center gap-2 rounded-md px-1 text-sm hover:bg-accent/50"
              >
                <StatusIcon type={issue.state.type as StateType} color={issue.state.color} size={14} />
                <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
                <span class="truncate">{issue.title}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </article>

  <DeleteDocumentDialog
    document={deleting ? { id: doc.id, title } : null}
    onOpenChange={(open) => {
      if (!open) deleting = false;
    }}
    onDeleted={() => void goto(documentsPath(doc.projectId))}
  />
</div>
