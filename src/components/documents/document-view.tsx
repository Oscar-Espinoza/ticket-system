'use client';

// One project document: breadcrumb + actions, icon, title, epic, and a
// full-width collaborative editor (Yjs key `doc:<id>`, see
// D2-collaborative-editing.md) whose markdown snapshot is saved to
// `document.content` 1.5 s after local typing stops. "Mentioned in" lists the
// issues whose description links here. Guests and archived docs are read-only.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Download,
  Link2,
  MoreHorizontal,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  archiveDocument,
  saveDocumentContent,
  unarchiveDocument,
  updateDocument,
} from '@/app/actions/documents';
import { CollabAvatars, CollabStatusBadge } from '@/components/collab/collab-avatars';
import { collabColor, useCollab, useCollabPeers } from '@/components/collab/use-collab';
import { useCollabEditor } from '@/components/collab/use-collab-editor';
import { Markdown, MarkdownEditor } from '@/components/editor';
import { serializeMarkdown } from '@/components/editor/rich-editor';
import { EpicIcon } from '@/components/epics/epic-glyphs';
import { EpicPicker } from '@/components/epics/epic-pickers';
import { epicPath } from '@/components/epics/epic-model';
import { relativeTime } from '@/components/issues/issue-properties';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton, StatusIcon } from '@/components/ui-icons';
import { docCollabKey } from '@/lib/collab/codec';
import { issuePath } from '@/lib/issue-links';
import type { StateType } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { DocumentIcon } from './document-icon';
import {
  DOCUMENT_ICONS,
  TITLE_MAX,
  documentsPath,
  downloadMarkdown,
  type DocumentBacklink,
  type DocumentDetail,
} from './document-model';
import { DeleteDocumentDialog, copyDocumentLink } from './documents-list';

export function DocumentView({ document: doc, backlinks }: { document: DocumentDetail; backlinks: DocumentBacklink[] }) {
  const router = useRouter();
  const data = useProjectData();
  const canWrite = useProjectPermission('write') && !doc.archivedAt;
  const canManage = useProjectPermission('write');
  const [title, setTitle] = useState(doc.title);
  const [icon, setIcon] = useState(doc.icon);
  const [epicId, setEpicId] = useState(doc.epic?.id ?? null);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();
  const editorRef = useRef<Editor | null>(null);

  const patch = (input: Parameters<typeof updateDocument>[0], rollback: () => void) =>
    startTransition(async () => {
      const result = await updateDocument(input);
      if (!result.ok) {
        rollback();
        toast.error(result.error);
      }
    });

  const saveTitle = () => {
    const next = title.replace(/\s+/g, ' ').trim() || 'Untitled';
    setTitle(next);
    if (next === doc.title) return;
    patch({ id: doc.id, title: next }, () => setTitle(doc.title));
  };

  const pickIcon = (next: string | null) => {
    const prev = icon;
    setIcon(next);
    patch({ id: doc.id, icon: next }, () => setIcon(prev));
  };

  const pickEpic = (next: string | null) => {
    const prev = epicId;
    setEpicId(next);
    patch({ id: doc.id, epicId: next }, () => setEpicId(prev));
  };

  const epic = data.epics.find((e) => e.id === epicId) ?? (doc.epic?.id === epicId ? doc.epic : null);

  const exportMarkdown = () => {
    const editor = editorRef.current;
    downloadMarkdown(title, editor && !editor.isDestroyed ? serializeMarkdown(editor) : doc.content);
  };

  const setArchived = (archived: boolean) =>
    startTransition(async () => {
      const result = archived ? await archiveDocument({ id: doc.id }) : await unarchiveDocument({ id: doc.id });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(archived ? 'Document archived' : 'Document restored');
        router.refresh();
      }
    });

  const user = useMemo(
    () => ({ id: data.viewer.id, name: data.viewer.name, image: data.viewer.image, color: collabColor(data.viewer.id) }),
    [data.viewer.id, data.viewer.name, data.viewer.image],
  );
  const collab = useCollab(docCollabKey(doc.id), user);
  const peers = useCollabPeers(collab.provider, data.viewer.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex min-h-8 items-center gap-2 text-sm">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <Link href={documentsPath(doc.projectId)} className="rounded px-1 hover:text-foreground">
            Docs
          </Link>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <span className="flex min-w-0 items-center gap-1.5 text-foreground">
            <DocumentIcon icon={icon} className="size-3.5 text-xs" />
            <span className="truncate">{title || 'Untitled'}</span>
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CollabStatusBadge snapshot={collab.snapshot} />
          <CollabAvatars peers={peers} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Document actions">
                <MoreHorizontal />
              </Button>
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
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  {doc.archivedAt ? (
                    <DropdownMenuItem onSelect={() => setArchived(false)}>
                      <ArchiveRestore />
                      Unarchive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setArchived(true)}>
                      <Archive />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    <Trash2 />
                    Delete…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {doc.archivedAt && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Archive className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-muted-foreground">
            Archived {relativeTime(new Date(doc.archivedAt))} — read-only until it’s restored.
          </span>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setArchived(false)}>
              Unarchive
            </Button>
          )}
        </div>
      )}

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-2 pb-16">
        <IconPicker icon={icon} disabled={!canWrite} onChange={pickIcon} />
        <textarea
          value={title}
          rows={1}
          maxLength={TITLE_MAX}
          readOnly={!canWrite}
          aria-label="Document title"
          placeholder="Untitled"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === title.length)) {
              e.preventDefault();
              saveTitle();
              editorRef.current?.commands.focus('start');
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setTitle(doc.title);
              e.currentTarget.blur();
            }
          }}
          className="field-sizing-content resize-none bg-transparent text-3xl leading-tight font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
        />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {canWrite ? (
            <EpicPicker value={epicId} epics={data.epics} onChange={pickEpic}>
              <button
                type="button"
                className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2 hover:bg-accent hover:text-foreground"
              >
                <EpicIcon color={epic?.color} className="size-3.5" />
                <span className="max-w-48 truncate">{epic ? epic.name : 'Add to epic'}</span>
              </button>
            </EpicPicker>
          ) : (
            epic && (
              <Link
                href={epicPath(doc.projectId, epic.id)}
                className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2 hover:bg-accent hover:text-foreground"
              >
                <EpicIcon color={epic.color} className="size-3.5" />
                <span className="max-w-48 truncate">{epic.name}</span>
              </Link>
            )
          )}
          {epic && canWrite && (
            <Link href={epicPath(doc.projectId, epic.id)} className="hover:text-foreground">
              Open epic
            </Link>
          )}
          <span suppressHydrationWarning>
            {doc.updatedBy ? `Edited by ${doc.updatedBy.name} ` : 'Edited '}
            {relativeTime(new Date(doc.updatedAt))}
          </span>
        </div>

        <DocumentBody
          document={doc}
          collab={collab}
          hasPeers={peers.length > 0}
          canWrite={canWrite}
          onEditor={(editor) => {
            editorRef.current = editor;
          }}
        />

        {backlinks.length > 0 && (
          <section aria-labelledby="doc-backlinks" className="mt-10 flex flex-col gap-1 border-t border-border pt-4">
            <h2 id="doc-backlinks" className="px-1 text-xs font-medium text-muted-foreground">
              Mentioned in
            </h2>
            <ul className="flex flex-col">
              {backlinks.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={issuePath(issue.projectId, issue.key)}
                    className="flex h-8 items-center gap-2 rounded-md px-1 text-sm hover:bg-accent/50"
                  >
                    <StatusIcon type={issue.state.type as StateType} color={issue.state.color} size={14} />
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
                    <span className="truncate">{issue.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <DeleteDocumentDialog
        document={deleting ? { id: doc.id, title } : null}
        onOpenChange={(open) => !open && setDeleting(false)}
        onDeleted={() => router.push(documentsPath(doc.projectId))}
      />
    </div>
  );
}

function IconPicker({
  icon,
  disabled,
  onChange,
}: {
  icon: string | null;
  disabled: boolean;
  onChange: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (disabled && !icon) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={icon ? 'Change icon' : 'Add icon'}
          className={cn(
            'flex w-fit items-center gap-1.5 rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none',
            icon ? 'size-12 justify-center text-4xl leading-none' : 'h-6 px-1.5 text-xs',
          )}
        >
          {icon ?? (
            <>
              <SmilePlus className="size-3.5" aria-hidden />
              Add icon
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div role="listbox" aria-label="Icons" className="grid grid-cols-8 gap-0.5">
          {DOCUMENT_ICONS.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === icon}
              onClick={() => {
                setOpen(false);
                onChange(option);
              }}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                option === icon && 'bg-accent',
              )}
            >
              {option}
            </button>
          ))}
        </div>
        {icon && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onChange(null);
            }}
            className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Remove icon
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DocumentBody({
  document: doc,
  collab,
  hasPeers,
  canWrite,
  onEditor: onEditorProp,
}: {
  document: DocumentDetail;
  collab: ReturnType<typeof useCollab>;
  hasPeers: boolean;
  canWrite: boolean;
  onEditor: (editor: Editor | null) => void;
}) {
  const { provider, extensions, snapshot } = collab;
  const [editor, setEditor] = useState<Editor | null>(null);
  const onEditorRef = useRef(onEditorProp);
  useEffect(() => {
    onEditorRef.current = onEditorProp;
  });
  const onEditor = useCallback((instance: Editor | null) => {
    setEditor(instance);
    onEditorRef.current(instance);
  }, []);

  const failed = useRef(false);
  const save = useCallback(
    (content: string) => {
      saveDocumentContent({ id: doc.id, content }).then(
        (result) => {
          if (result.ok) failed.current = false;
          else if (!failed.current) {
            failed.current = true;
            toast.error(result.error);
          }
        },
        () => {
          // Offline: the Yjs state still syncs; the next save catches the snapshot up.
        },
      );
    },
    [doc.id],
  );

  const { state, onChange } = useCollabEditor({
    provider,
    snapshot,
    editor,
    markdown: doc.content,
    truth: 'collab',
    hasPeers,
    onSave: save,
  });

  const unavailable = snapshot.status === 'error' && !snapshot.synced;
  // Guests can't seed: before anyone with write access opens it, show the snapshot.
  const snapshotOnly = unavailable || (snapshot.synced && snapshot.empty && !snapshot.canWrite) || state === 'lossy';

  if (snapshotOnly) {
    return (
      <div className="flex flex-col gap-3">
        {unavailable && (
          <p role="status" className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Live editing is unavailable right now — showing the last saved version. Reload to try again.
          </p>
        )}
        {doc.content ? <Markdown>{doc.content}</Markdown> : <p className="text-sm text-muted-foreground">This document is empty.</p>}
      </div>
    );
  }

  // The editor mounts hidden (its schema seeds / checks the doc) and shows once
  // reconciled, so the text never flashes empty.
  const ready = state === 'ready';
  return (
    <>
      {!ready && (
        <div aria-busy="true" className="flex min-h-[40vh] flex-col gap-2 pt-2">
          {doc.content ? (
            <div className="opacity-60">
              <Markdown>{doc.content}</Markdown>
            </div>
          ) : (
            <>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </>
          )}
        </div>
      )}
      {snapshot.synced && extensions && (
        <div hidden={!ready}>
          <MarkdownEditor
            aria-label="Document"
            value={doc.content}
            onChange={onChange}
            controlled={false}
            history={false}
            extensions={extensions}
            onEditor={onEditor}
            disabled={!canWrite || !snapshot.canWrite}
            placeholder="Write something, or type / for commands…"
            projectId={doc.projectId}
            // A footer toolbar at the end of a long page helps no one: shortcuts, `/` and paste do the work.
            toolbar={false}
            className="rounded-none border-0 bg-transparent opacity-100 focus-within:border-0 focus-within:ring-0 dark:bg-transparent"
            textareaClassName="min-h-[50vh] max-h-none overflow-visible px-0 text-[15px]"
          />
        </div>
      )}
    </>
  );
}
