<!--
  Docs tab: the project's documents as dense rows (icon, title, preview, epic,
  last editor, updated), a search box kept in `?q=` (title + content, server
  side), Active / Archived, and per-row actions (copy link, archive, delete).
  (DeleteDocumentDialog is ./delete-document-dialog.svelte;
  copyDocumentLink is exported from this file's module script).
-->
<script module lang="ts">
  import { toast } from 'svelte-sonner';

  import { documentPath } from '@/lib/document-model';

  export async function copyDocumentLink(projectId: string, documentId: string) {
    try {
      await navigator.clipboard.writeText(new URL(documentPath(projectId, documentId), window.location.origin).href);
      toast.success('Link copied');
    } catch {
      toast.error('Couldn’t copy the link');
    }
  }
</script>

<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
  import FileText from '@lucide/svelte/icons/file-text';
  import Link2 from '@lucide/svelte/icons/link-2';
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import SearchX from '@lucide/svelte/icons/search-x';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  import { archiveDocument, unarchiveDocument } from '@/lib/actions/documents';
  import type { DocumentSummary } from '@/lib/document-model';
  import { relativeTime } from '@/lib/relative-time';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { Avatar, EmptyState } from '@/lib/components/ui-icons';
  import DeleteDocumentDialog from './delete-document-dialog.svelte';
  import DocumentIcon from './document-icon.svelte';
  import DocumentSearch from './document-search.svelte';
  import NewDocumentMenu from './new-document-menu.svelte';

  type Filter = 'active' | 'archived';

  let {
    projectId,
    documents,
    query,
  }: {
    projectId: string;
    documents: DocumentSummary[];
    query: string;
  } = $props();

  const canWrite = useProjectPermission('write');
  let filter = $state<Filter>('active');
  let deleting = $state.raw<DocumentSummary | null>(null);

  const active = $derived(documents.filter((d) => !d.archivedAt));
  const archived = $derived(documents.filter((d) => d.archivedAt));
  const shown = $derived(filter === 'active' ? active : archived);

  // The action wrappers refresh the page (the actions revalidate), which is
  // what React's explicit router.refresh() did.
  async function run(action: Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    const result = await action;
    if (!result.ok) toast.error(result.error);
    else toast.success(success);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      bind:value={() => filter, (value: string) => value && (filter = value as Filter)}
      aria-label="Show active or archived documents"
    >
      <ToggleGroupItem value="active" class="gap-1.5 px-2.5 text-xs">
        Active <span class="text-muted-foreground tabular-nums">{active.length}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="archived" class="gap-1.5 px-2.5 text-xs">
        Archived <span class="text-muted-foreground tabular-nums">{archived.length}</span>
      </ToggleGroupItem>
    </ToggleGroup>
    <DocumentSearch initial={query} />
    {#if canWrite.current}
      <NewDocumentMenu {projectId} class="ml-auto" />
    {/if}
  </div>

  {#if shown.length === 0}
    {#if query}
      <EmptyState title="No matching documents" description={`Nothing mentions “${query}”.`}>
        {#snippet icon()}<SearchX />{/snippet}
      </EmptyState>
    {:else if filter === 'archived'}
      <EmptyState title="No archived documents">
        {#snippet icon()}<Archive />{/snippet}
      </EmptyState>
    {:else}
      <EmptyState
        title="No documents yet"
        description="Write specs, RFCs and meeting notes next to the issues they describe — edited together in real time."
        action={canWrite.current ? newDocAction : undefined}
      >
        {#snippet icon()}<FileText />{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <ul role="list" class="flex flex-col border-t border-border">
      {#each shown as doc (doc.id)}
        <li
          class="group flex min-h-10 items-center gap-2 border-b border-border pr-1 hover:bg-accent/50 focus-within:bg-accent/50"
        >
          <a
            href={documentPath(projectId, doc.id)}
            class="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <DocumentIcon icon={doc.icon} />
            <span class="flex min-w-0 flex-1 items-baseline gap-3">
              <span class="truncate font-medium">{doc.title}</span>
              {#if doc.excerpt}
                <span class="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block">{doc.excerpt}</span>
              {/if}
            </span>
            {#if doc.epic}
              <span
                class="hidden max-w-40 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground sm:flex"
              >
                <EpicIcon color={doc.epic.color} class="size-3.5" />
                <span class="truncate">{doc.epic.name}</span>
              </span>
            {/if}
            <span
              class="hidden w-6 shrink-0 md:block"
              title={doc.updatedBy ? `Last edited by ${doc.updatedBy.name}` : undefined}
            >
              {#if doc.updatedBy}
                <Avatar name={doc.updatedBy.name} src={doc.updatedBy.image} size={20} />
              {/if}
            </span>
            <time
              datetime={doc.updatedAt}
              title={`Updated ${new Date(doc.updatedAt).toLocaleString()}`}
              class="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
            >
              {relativeTime(new Date(doc.updatedAt))}
            </time>
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${doc.title}`}
                  class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal />
                </Button>
              {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => copyDocumentLink(projectId, doc.id)}>
                <Link2 />
                Copy link
              </DropdownMenuItem>
              {#if canWrite.current}
                {#if doc.archivedAt}
                  <DropdownMenuItem onSelect={() => run(unarchiveDocument({ id: doc.id }), 'Document restored')}>
                    <ArchiveRestore />
                    Unarchive
                  </DropdownMenuItem>
                {:else}
                  <DropdownMenuItem onSelect={() => run(archiveDocument({ id: doc.id }), 'Document archived')}>
                    <Archive />
                    Archive
                  </DropdownMenuItem>
                {/if}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => (deleting = doc)}>
                  <Trash2 />
                  Delete…
                </DropdownMenuItem>
              {/if}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- The delete action's wrapper refreshes the list (React: onDeleted → router.refresh()). -->
  <DeleteDocumentDialog
    document={deleting}
    onOpenChange={(open) => {
      if (!open) deleting = null;
    }}
    onDeleted={() => {}}
  />
</div>

{#snippet newDocAction()}
  <NewDocumentMenu {projectId} />
{/snippet}
