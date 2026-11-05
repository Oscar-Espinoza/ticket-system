<!--
  The collaborative body of a document (local DocumentBody of document-view.tsx):
  the full-width editor once the Y.Doc is reconciled, the saved snapshot while
  it loads, or the snapshot only when live editing is unavailable / for guests
  before anyone with write access opened it.
-->
<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { toast } from 'svelte-sonner';

  import { saveDocumentContent } from '@/lib/actions/documents';
  import type { DocumentDetail } from '@/lib/components/documents/document-model';
  import type { UseCollab } from '@/lib/components/collab/use-collab.svelte';
  import { useCollabEditor } from '@/lib/components/collab/use-collab-editor.svelte';
  import { Markdown, MarkdownEditor } from '@/lib/components/editor';
  import { Skeleton } from '@/lib/components/ui-icons';

  let {
    document: doc,
    collab,
    hasPeers,
    canWrite,
    onEditor,
  }: {
    document: DocumentDetail;
    collab: UseCollab;
    hasPeers: boolean;
    canWrite: boolean;
    onEditor: (editor: Editor | null) => void;
  } = $props();

  let editor = $state.raw<Editor | null>(null);
  function handleEditor(instance: Editor | null) {
    editor = instance;
    onEditor(instance);
  }

  let failed = false;
  function save(content: string) {
    saveDocumentContent({ id: doc.id, content }).then(
      (result) => {
        if (result.ok) failed = false;
        else if (!failed) {
          failed = true;
          toast.error(result.error);
        }
      },
      () => {
        // Offline: the Yjs state still syncs; the next save catches the snapshot up.
      },
    );
  }

  const collabEditor = useCollabEditor(() => ({
    provider: collab.provider,
    snapshot: collab.snapshot,
    editor,
    markdown: doc.content,
    truth: 'collab',
    hasPeers,
    onSave: save,
  }));

  const snapshot = $derived(collab.snapshot);
  const unavailable = $derived(snapshot.status === 'error' && !snapshot.synced);
  // Guests can't seed: before anyone with write access opens it, show the snapshot.
  const snapshotOnly = $derived(
    unavailable || (snapshot.synced && snapshot.empty && !snapshot.canWrite) || collabEditor.state === 'lossy',
  );
  // The editor mounts hidden (its schema seeds / checks the doc) and shows once
  // reconciled, so the text never flashes empty.
  const ready = $derived(collabEditor.state === 'ready');
</script>

{#if snapshotOnly}
  <div class="flex flex-col gap-3">
    {#if unavailable}
      <p role="status" class="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Live editing is unavailable right now — showing the last saved version. Reload to try again.
      </p>
    {/if}
    {#if doc.content}
      <Markdown source={doc.content} />
    {:else}
      <p class="text-sm text-muted-foreground">This document is empty.</p>
    {/if}
  </div>
{:else}
  {#if !ready}
    <div aria-busy="true" class="flex min-h-[40vh] flex-col gap-2 pt-2">
      {#if doc.content}
        <div class="opacity-60">
          <Markdown source={doc.content} />
        </div>
      {:else}
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
      {/if}
    </div>
  {/if}
  {#if snapshot.synced && collab.extensions}
    <div hidden={!ready}>
      <!-- A footer toolbar at the end of a long page helps no one: shortcuts, `/` and paste do the work. -->
      <MarkdownEditor
        aria-label="Document"
        value={doc.content}
        onChange={collabEditor.onChange}
        controlled={false}
        history={false}
        extensions={collab.extensions}
        onEditor={handleEditor}
        disabled={!canWrite || !snapshot.canWrite}
        placeholder="Write something, or type / for commands…"
        projectId={doc.projectId}
        toolbar={false}
        class="rounded-none border-0 bg-transparent opacity-100 focus-within:border-0 focus-within:ring-0 dark:bg-transparent"
        textareaClassName="min-h-[50vh] max-h-none overflow-visible px-0 text-[15px]"
      />
    </div>
  {/if}
{/if}
