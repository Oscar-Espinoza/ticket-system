<!--
  Documents linked to an epic, for the epic detail page (the epic lane renders
  this with `documentsForEpic(epicId, userId)` from src/lib/documents, loaded
  server-side). "New doc" creates a blank document already linked to the epic.
  Port of epic-documents.tsx.
-->
<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text';
  import Plus from '@lucide/svelte/icons/plus';

  import { documentPath, type DocumentSummary } from '@/components/documents/document-model';
  import { relativeTime } from '@/lib/components/comments/relative-time';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import DocumentIcon from './document-icon.svelte';
  import { useCreateDocument } from './use-create-document.svelte';

  let {
    projectId,
    epicId,
    documents,
  }: {
    projectId: string;
    epicId: string;
    documents: DocumentSummary[];
  } = $props();

  const canWrite = useProjectPermission('write');
  const doc = useCreateDocument(
    () => projectId,
    () => epicId,
  );
</script>

<section aria-labelledby={`epic-docs-${epicId}`} class="flex flex-col gap-1">
  <div class="flex items-center gap-2">
    <h2 id={`epic-docs-${epicId}`} class="text-xs font-medium text-muted-foreground">Documents</h2>
    {#if canWrite.current}
      <Button
        variant="ghost"
        size="icon-sm"
        class="ml-auto size-6"
        aria-label="New document in this epic"
        disabled={doc.pending}
        onclick={() => doc.create('blank')}
      >
        <Plus />
      </Button>
    {/if}
  </div>
  {#if documents.length === 0}
    <p class="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
      <FileText class="size-3.5" aria-hidden="true" />
      No documents yet.
    </p>
  {:else}
    <ul class="flex flex-col">
      {#each documents as item (item.id)}
        <li>
          <a
            href={documentPath(item.projectId, item.id)}
            class="flex h-8 items-center gap-2 rounded-md px-1 text-sm hover:bg-accent/50"
          >
            <DocumentIcon icon={item.icon} />
            <span class="min-w-0 flex-1 truncate">{item.title}</span>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
              {relativeTime(new Date(item.updatedAt))}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
