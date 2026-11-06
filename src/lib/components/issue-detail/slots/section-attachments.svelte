<!--
  Files and links. Uploads go to POST /api/attachments (multipart,
  ≤ 4 MB); the whole section is a drop target. Files open through the
  membership-checked GET /api/attachments/[id].
-->
<script module lang="ts">
  import { actionErrorText } from '@/lib/action-errors';
  import {
    MAX_ATTACHMENT_LABEL,
    type AttachmentView,
  } from '@/lib/attachment-utils';

  type Row = AttachmentView & { pending?: boolean };


  async function uploadFile(projectId: string, ticketId: string, file: File) {
    const body = new FormData();
    body.set('projectId', projectId);
    body.set('ticketId', ticketId);
    body.set('file', file);
    const response = await fetch('/api/attachments', { method: 'POST', body });
    // The platform itself answers 413 (as HTML) above its own body limit.
    if (response.status === 413) throw new Error(`${file.name} is too large (max ${MAX_ATTACHMENT_LABEL}).`);
    const result = (await response.json().catch(() => null)) as
      | { ok: true; attachment: AttachmentView }
      | { ok: false; error: string }
      | null;
    if (!result) throw new Error(`Couldn't upload ${file.name}.`);
    if (!result.ok) throw new Error(actionErrorText(result.error));
    return { ...result.attachment, createdAt: new Date(result.attachment.createdAt) };
  }
</script>

<script lang="ts">
  import FileIcon from '@lucide/svelte/icons/file';
  import FileArchiveIcon from '@lucide/svelte/icons/file-archive';
  import FileImageIcon from '@lucide/svelte/icons/file-image';
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import PaperclipIcon from '@lucide/svelte/icons/paperclip';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { addLink, deleteAttachment, getIssueAttachments } from '@/lib/actions/attachments';
  import {
    MAX_ATTACHMENT_BYTES,
    attachmentPath,
    formatBytes,
    isPreviewableImage,
  } from '@/lib/attachment-utils';
  import SectionHeader from '@/lib/components/issue-hierarchy/section-header.svelte';
  import { relativeTime } from '@/lib/relative-time';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import type { IssueRow } from '@/lib/issue-model';
  import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';
  import { cn } from '@/lib/utils';
  import AttachmentLinkForm from './attachment-link-form.svelte';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const data = useProjectData();
  const canWritePermission = useProjectPermission('write');
  const isAdminPermission = useProjectPermission('admin');
  const canWrite = $derived(canWritePermission.current);
  const isAdmin = $derived(isAdminPermission.current);
  let rows = $state.raw<Row[] | null>(null);
  let dragDepth = $state(0);
  let linkOpen = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    const projectId = issue.projectId;
    const ticketId = issue.id;
    let cancelled = false;
    getIssueAttachments({ projectId, ticketId })
      .then((result) => {
        if (!cancelled) rows = result.ok ? result.attachments : [];
      })
      .catch(() => {
        if (!cancelled) rows = rows ?? [];
      });
    return () => {
      cancelled = true;
    };
  });

  async function upload(files: File[]) {
    if (!canWrite || files.length === 0) return;
    const accepted = files.filter((file) => {
      if (file.size === 0) toast.error(`${file.name} is empty.`);
      else if (file.size > MAX_ATTACHMENT_BYTES) toast.error(`${file.name} is larger than ${MAX_ATTACHMENT_LABEL}.`);
      else return true;
      return false;
    });
    if (accepted.length === 0) return;

    const projectId = issue.projectId;
    const ticketId = issue.id;
    const pending: Row[] = accepted.map((file) => ({
      id: `temp-${crypto.randomUUID()}`,
      kind: 'file' as const,
      title: file.name,
      url: null,
      contentType: file.type || null,
      size: file.size,
      uploader: data.viewer,
      createdAt: new Date(),
      pending: true,
    }));
    rows = [...pending, ...(rows ?? [])];

    const results = await Promise.allSettled(accepted.map((file) => uploadFile(projectId, ticketId, file)));
    rows = (rows ?? []).flatMap((row) => {
      const index = pending.findIndex((p) => p.id === row.id);
      if (index === -1) return [row];
      const result = results[index];
      return result.status === 'fulfilled' ? [result.value] : [];
    });
    results.forEach((result) => {
      if (result.status === 'rejected') {
        toast.error(result.reason instanceof Error ? result.reason.message : 'Upload failed.');
      }
    });
    // React: router.refresh() — the upload goes through /api, not an action wrapper.
    if (results.some((r) => r.status === 'fulfilled')) void refreshAfterWrite();
  }

  async function remove(row: Row) {
    rows = rows?.filter((r) => r.id !== row.id) ?? null;
    try {
      // The action wrapper refreshes the page after it (React: router.refresh()).
      const result = await deleteAttachment({ projectId: issue.projectId, attachmentId: row.id });
      if (result.ok) return;
      toast.error(actionErrorText(result.error));
    } catch {
      toast.error('Something went wrong — the attachment was not deleted.');
    }
    // Put it back where it was (newest first).
    rows = [...(rows ?? []), row].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  async function submitLink(url: string, title: string) {
    const result = await addLink({
      projectId: issue.projectId,
      ticketId: issue.id,
      url,
      title,
    }).catch(() => ({ ok: false as const, error: 'Something went wrong — the link was not added.' }));
    if (!result.ok) {
      toast.error(actionErrorText(result.error));
      return false;
    }
    // The action wrapper already refreshed the page (React: router.refresh()).
    rows = [result.attachment, ...(rows ?? [])];
    linkOpen = false;
    return true;
  }

  // Only file drags light up the drop zone (not text / link drags).
  const isFileDrag = (event: DragEvent) => canWrite && (event.dataTransfer?.types.includes('Files') ?? false);

  function ondragenter(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
  }
  function ondragover(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }
  function ondragleave(event: DragEvent) {
    if (!isFileDrag(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
  }
  function ondrop(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    void upload(Array.from(event.dataTransfer?.files ?? []));
  }

  const list = $derived(rows ?? []);
  const dragging = $derived(dragDepth > 0);

  function attachmentIconOf(row: Row) {
    if (row.kind === 'link') return Link2Icon;
    const type = row.contentType ?? '';
    if (type.startsWith('image/')) return FileImageIcon;
    if (type === 'application/pdf' || type.startsWith('text/')) return FileTextIcon;
    if (/zip|compressed|tar|rar|7z|gzip/.test(type)) return FileArchiveIcon;
    return FileIcon;
  }
</script>

{#snippet attachmentItem(row: Row, canDelete: boolean, onDelete: () => void)}
  {@const href = row.kind === 'link' ? row.url! : attachmentPath(row.id)}
  {@const meta = [
    row.size !== null ? formatBytes(row.size) : row.url && new URL(row.url).host,
    row.uploader?.name,
    relativeTime(row.createdAt),
  ].filter(Boolean)}
  {@const AttachmentIcon = attachmentIconOf(row)}
  <li class="group/att flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/60">
    <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
      {#if row.pending}
        <Loader2Icon class="size-4 animate-spin text-muted-foreground" />
      {:else if isPreviewableImage(row.contentType)}
        <img src={attachmentPath(row.id)} alt="" loading="lazy" class="size-full object-cover" />
      {:else}
        <AttachmentIcon class="size-4 text-muted-foreground" />
      {/if}
    </span>
    <div class="flex min-w-0 flex-1 flex-col">
      {#if row.pending}
        <span class="truncate text-sm text-muted-foreground">{row.title}</span>
      {:else}
        <a {href} target="_blank" rel="noreferrer noopener" class="truncate text-sm hover:underline">
          {row.title}
        </a>
      {/if}
      <span class="truncate text-xs text-muted-foreground">
        {row.pending ? 'Uploading…' : meta.join(' · ')}
      </span>
    </div>
    {#if canDelete}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${row.title}`}
        title="Delete"
        onclick={onDelete}
        class="opacity-0 group-hover/att:opacity-100 focus-visible:opacity-100"
      >
        <Trash2Icon />
      </Button>
    {/if}
  </li>
{/snippet}

{#if list.length > 0 || canWrite}
  <section
    aria-label="Attachments"
    {ondragenter}
    {ondragover}
    {ondragleave}
    {ondrop}
    class={cn(
      'relative -mx-1.5 flex flex-col gap-1 rounded-md px-1.5 py-1',
      dragging && 'bg-primary/5 outline-2 outline-primary/50 outline-dashed',
    )}
  >
    <SectionHeader title="Attachments">
      {#if canWrite}
        <Popover bind:open={linkOpen}>
          <PopoverTrigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon-xs" aria-label="Add link" title="Add link">
                <Link2Icon />
              </Button>
            {/snippet}
          </PopoverTrigger>
          <PopoverContent align="end" class="w-80 p-3">
            <AttachmentLinkForm onSubmit={submitLink} />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Upload files"
          title={`Upload files (max ${MAX_ATTACHMENT_LABEL} each)`}
          onclick={() => fileInput?.click()}
        >
          <PaperclipIcon />
        </Button>
        <input
          bind:this={fileInput}
          type="file"
          multiple
          hidden
          onchange={(event) => {
            void upload(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
      {/if}
    </SectionHeader>

    {#if list.length > 0}
      <ul class="flex flex-col">
        {#each list as row (row.id)}
          {@render attachmentItem(
            row,
            canWrite && !row.pending && (isAdmin || row.uploader?.id === data.viewer.id),
            () => void remove(row),
          )}
        {/each}
      </ul>
    {/if}

    {#if canWrite && rows !== null && list.length === 0}
      <button
        type="button"
        onclick={() => fileInput?.click()}
        class="flex h-8 w-fit items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <PlusIcon class="size-3.5" />
        Drop files here or click to upload
      </button>
    {/if}

    {#if dragging}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/70 text-sm font-medium">
        Drop to attach (max {MAX_ATTACHMENT_LABEL} each)
      </div>
    {/if}
  </section>
{/if}
