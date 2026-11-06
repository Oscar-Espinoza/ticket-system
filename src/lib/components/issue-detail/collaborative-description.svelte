<!--
  The collaborative (Yjs) description editor of DescriptionEditor. Shared document key `issue:<id>`, relayed
  through /api/collab; saves as you type via `onSave` and flushes on unmount.
-->
<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { untrack } from 'svelte';

  import { markDescriptionProjected } from '@/lib/actions/tickets';
  import CollabAvatars from '@/lib/components/collab/collab-avatars.svelte';
  import CollabStatusBadge from '@/lib/components/collab/collab-status-badge.svelte';
  import { collabColor, useCollab, useCollabPeers } from '@/lib/components/collab/use-collab.svelte';
  import { useCollabEditor } from '@/lib/components/collab/use-collab-editor.svelte';
  import { Markdown, MarkdownEditor } from '@/lib/components/editor';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { issueCollabKey } from '@/lib/collab/codec';
  import type { IssueRow } from '@/lib/issue-model';

  let {
    issue,
    saved,
    onSave,
    onClose,
    onUnavailable,
  }: {
    issue: IssueRow;
    saved: string;
    onSave: (markdown: string) => void;
    onClose: () => void;
    onUnavailable: () => void;
  } = $props();

  const data = useProjectData();
  const user = $derived({
    id: data.viewer.id,
    name: data.viewer.name,
    image: data.viewer.image,
    color: collabColor(data.viewer.id),
  });
  const collab = useCollab(
    () => issueCollabKey(issue.id),
    () => user,
  );
  const peers = useCollabPeers(
    () => collab.provider,
    () => data.viewer.id,
  );
  let editor = $state.raw<Editor | null>(null);
  const onEditor = (instance: Editor | null) => (editor = instance);
  const collabEditor = useCollabEditor(() => ({
    provider: collab.provider,
    snapshot: collab.snapshot,
    editor,
    markdown: saved,
    truth: 'markdown' as const,
    hasPeers: peers.current.length > 0,
    onSave,
    onAdopted: (markdown: string) => {
      void markDescriptionProjected({ projectId: issue.projectId, id: issue.id, markdown }).catch(() => {
        // Best effort: until marked, the next editor adopts the same markdown again.
      });
    },
  }));

  const snapshot = $derived(collab.snapshot);
  const unavailable = $derived(collabEditor.state === 'lossy' || (snapshot.status === 'error' && !snapshot.synced));
  $effect(() => {
    if (unavailable) untrack(() => onUnavailable());
  });

  // The editor mounts hidden (its schema seeds / checks the doc) and shows
  // once reconciled, so the text never flashes empty; focus then.
  const ready = $derived(collabEditor.state === 'ready');
  $effect(() => {
    const instance = editor;
    if (ready && instance) untrack(() => !instance.isDestroyed && instance.commands.focus('end'));
  });
</script>

<div class="flex flex-col gap-1">
  {#if ready && (peers.current.length > 0 || snapshot.status !== 'synced')}
    <div class="flex min-h-5 items-center justify-end gap-2">
      <CollabStatusBadge {snapshot} />
      <CollabAvatars peers={peers.current} />
    </div>
  {/if}
  {#if !ready}
    <div aria-busy="true" class="flex min-h-32 flex-col gap-1 rounded-lg border border-input px-2.5 py-2 dark:bg-input/30">
      <CollabStatusBadge {snapshot} />
      {#if saved}
        <div class="opacity-70">
          <Markdown source={saved} />
        </div>
      {/if}
    </div>
  {/if}
  {#if snapshot.synced && collab.extensions}
    <div hidden={!ready}>
      <MarkdownEditor
        aria-label="Description"
        value={saved}
        onChange={collabEditor.onChange}
        controlled={false}
        history={false}
        extensions={collab.extensions}
        {onEditor}
        onSubmit={onClose}
        onCancel={onClose}
        onBlur={onClose}
        disabled={!snapshot.canWrite}
        placeholder="Add a description… (type / for commands)"
        projectId={issue.projectId}
        ticketId={issue.id}
        textareaClassName="min-h-32"
      />
    </div>
  {/if}
</div>
