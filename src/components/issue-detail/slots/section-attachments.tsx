'use client';

// Owner: B4. Files and links. Uploads go to POST /api/attachments (multipart,
// ≤ 5 MB); the whole section is a drop target. Files open through the
// membership-checked GET /api/attachments/[id].

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  File as FileIcon,
  FileArchive,
  FileImage,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { addLink, deleteAttachment, getIssueAttachments } from '@/app/actions/attachments';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentPath,
  formatBytes,
  isPreviewableImage,
  parseLinkUrl,
  type AttachmentView,
} from '@/components/issue-hierarchy/attachment-utils';
import { SectionHeader } from '@/components/issue-hierarchy/issue-ref-row';
import { relativeTime } from '@/components/issues/issue-properties';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

type Row = AttachmentView & { pending?: boolean };

function errorMessage(error: string) {
  return error === 'Forbidden' ? "You don't have permission to do that in this project." : error;
}

function AttachmentIcon({ row }: { row: Row }) {
  const className = 'size-4 text-muted-foreground';
  if (row.kind === 'link') return <Link2 className={className} />;
  const type = row.contentType ?? '';
  if (type.startsWith('image/')) return <FileImage className={className} />;
  if (type === 'application/pdf' || type.startsWith('text/')) return <FileText className={className} />;
  if (/zip|compressed|tar|rar|7z|gzip/.test(type)) return <FileArchive className={className} />;
  return <FileIcon className={className} />;
}

async function uploadFile(projectId: string, ticketId: string, file: File) {
  const body = new FormData();
  body.set('projectId', projectId);
  body.set('ticketId', ticketId);
  body.set('file', file);
  const response = await fetch('/api/attachments', { method: 'POST', body });
  // The platform itself answers 413 (as HTML) above its own body limit.
  if (response.status === 413) throw new Error(`${file.name} is too large (max 5 MB).`);
  const result = (await response.json().catch(() => null)) as
    | { ok: true; attachment: AttachmentView }
    | { ok: false; error: string }
    | null;
  if (!result) throw new Error(`Couldn't upload ${file.name}.`);
  if (!result.ok) throw new Error(errorMessage(result.error));
  return { ...result.attachment, createdAt: new Date(result.attachment.createdAt) };
}

export function SectionAttachments({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void mutations;
  const { viewer } = useProjectData();
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getIssueAttachments({ projectId: issue.projectId, ticketId: issue.id })
      .then((result) => {
        if (!cancelled) setRows(result.ok ? result.attachments : []);
      })
      .catch(() => {
        if (!cancelled) setRows((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [issue.projectId, issue.id]);

  const upload = async (files: File[]) => {
    if (!canWrite || files.length === 0) return;
    const accepted = files.filter((file) => {
      if (file.size === 0) toast.error(`${file.name} is empty.`);
      else if (file.size > MAX_ATTACHMENT_BYTES) toast.error(`${file.name} is larger than 5 MB.`);
      else return true;
      return false;
    });
    if (accepted.length === 0) return;

    const pending = accepted.map((file) => ({
      id: `temp-${crypto.randomUUID()}`,
      kind: 'file' as const,
      title: file.name,
      url: null,
      contentType: file.type || null,
      size: file.size,
      uploader: viewer,
      createdAt: new Date(),
      pending: true,
    }));
    setRows((current) => [...pending, ...(current ?? [])]);

    const results = await Promise.allSettled(
      accepted.map((file) => uploadFile(issue.projectId, issue.id, file)),
    );
    setRows((current) =>
      (current ?? []).flatMap((row) => {
        const index = pending.findIndex((p) => p.id === row.id);
        if (index === -1) return [row];
        const result = results[index];
        return result.status === 'fulfilled' ? [result.value] : [];
      }),
    );
    results.forEach((result) => {
      if (result.status === 'rejected') {
        toast.error(result.reason instanceof Error ? result.reason.message : 'Upload failed.');
      }
    });
    if (results.some((r) => r.status === 'fulfilled')) router.refresh();
  };

  const remove = async (row: Row) => {
    setRows((current) => current?.filter((r) => r.id !== row.id) ?? null);
    try {
      const result = await deleteAttachment({ projectId: issue.projectId, attachmentId: row.id });
      if (result.ok) {
        router.refresh();
        return;
      }
      toast.error(errorMessage(result.error));
    } catch {
      toast.error('Something went wrong — the attachment was not deleted.');
    }
    // Put it back where it was (newest first).
    setRows((current) =>
      [...(current ?? []), row].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    );
  };

  // Only file drags light up the drop zone (not text / link drags).
  const isFileDrag = (event: DragEvent) => canWrite && event.dataTransfer.types.includes('Files');
  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      setDragDepth((d) => d + 1);
    },
    onDragOver: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      setDragDepth((d) => Math.max(0, d - 1));
    },
    onDrop: (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      setDragDepth(0);
      void upload(Array.from(event.dataTransfer.files));
    },
  };

  const list = rows ?? [];
  if (list.length === 0 && !canWrite) return null;
  const dragging = dragDepth > 0;

  return (
    <section
      aria-label="Attachments"
      {...dropProps}
      className={cn(
        'relative -mx-1.5 flex flex-col gap-1 rounded-md px-1.5 py-1',
        dragging && 'bg-primary/5 outline-2 outline-primary/50 outline-dashed',
      )}
    >
      <SectionHeader title="Attachments">
        {canWrite && (
          <>
            <Popover open={linkOpen} onOpenChange={setLinkOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Add link" title="Add link">
                  <Link2 />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <LinkForm
                  onSubmit={async (url, title) => {
                    const result = await addLink({
                      projectId: issue.projectId,
                      ticketId: issue.id,
                      url,
                      title,
                    }).catch(() => ({ ok: false as const, error: 'Something went wrong — the link was not added.' }));
                    if (!result.ok) {
                      toast.error(errorMessage(result.error));
                      return false;
                    }
                    setRows((current) => [result.attachment, ...(current ?? [])]);
                    setLinkOpen(false);
                    router.refresh();
                    return true;
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Upload files"
              title="Upload files (max 5 MB each)"
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip />
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                void upload(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </>
        )}
      </SectionHeader>

      {list.length > 0 && (
        <ul className="flex flex-col">
          {list.map((row) => (
            <AttachmentItem
              key={row.id}
              row={row}
              canDelete={canWrite && !row.pending && (isAdmin || row.uploader?.id === viewer.id)}
              onDelete={() => void remove(row)}
            />
          ))}
        </ul>
      )}

      {canWrite && rows !== null && list.length === 0 && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-8 w-fit items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Drop files here or click to upload
        </button>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/70 text-sm font-medium">
          Drop to attach (max 5 MB each)
        </div>
      )}
    </section>
  );
}

function AttachmentItem({
  row,
  canDelete,
  onDelete,
}: {
  row: Row;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const href = row.kind === 'link' ? row.url! : attachmentPath(row.id);
  const meta = [
    row.size !== null ? formatBytes(row.size) : row.url && new URL(row.url).host,
    row.uploader?.name,
    relativeTime(row.createdAt),
  ].filter(Boolean);

  return (
    <li className="group/att flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/60">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
        {row.pending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : isPreviewableImage(row.contentType) ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-gated route, next/image can't optimize it
          <img src={attachmentPath(row.id)} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <AttachmentIcon row={row} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        {row.pending ? (
          <span className="truncate text-sm text-muted-foreground">{row.title}</span>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate text-sm hover:underline"
          >
            {row.title}
          </a>
        )}
        <span className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
          {row.pending ? 'Uploading…' : meta.join(' · ')}
        </span>
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${row.title}`}
          title="Delete"
          onClick={onDelete}
          className="opacity-0 group-hover/att:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function LinkForm({ onSubmit }: { onSubmit: (url: string, title: string) => Promise<boolean> }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseLinkUrl(url);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    const done = await onSubmit(parsed, title.trim());
    setBusy(false);
    if (done) {
      setUrl('');
      setTitle('');
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Input
        autoFocus
        type="url"
        aria-label="Link URL"
        placeholder="https://…"
        value={url}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setUrl(event.target.value);
          setInvalid(false);
        }}
        className="h-7"
      />
      <Input
        aria-label="Link title"
        placeholder="Title (optional)"
        value={title}
        maxLength={255}
        onChange={(event) => setTitle(event.target.value)}
        className="h-7"
      />
      {invalid && <p className="text-xs text-destructive">Enter an http(s) URL.</p>}
      <Button type="submit" size="sm" className="self-end" disabled={busy || !url.trim()}>
        {busy && <Loader2 className="animate-spin" />}
        Add link
      </Button>
    </form>
  );
}
