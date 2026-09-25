'use client';

// Docs tab: the project's documents as dense rows (icon, title, preview, epic,
// last editor, updated), a search box kept in `?q=` (title + content, server
// side), Active / Archived, and per-row actions (copy link, archive, delete).

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, FileText, Link2, MoreHorizontal, Search, SearchX, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { archiveDocument, deleteDocument, unarchiveDocument } from '@/app/actions/documents';
import { EpicIcon } from '@/components/epics/epic-glyphs';
import { relativeTime } from '@/components/issues/issue-properties';
import { useProjectPermission } from '@/components/project/project-data';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState } from '@/components/ui-icons';
import { DocumentIcon } from './document-icon';
import { documentPath, type DocumentSummary } from './document-model';
import { NewDocumentMenu } from './new-document-menu';

type Filter = 'active' | 'archived';

export async function copyDocumentLink(projectId: string, documentId: string) {
  try {
    await navigator.clipboard.writeText(new URL(documentPath(projectId, documentId), window.location.origin).href);
    toast.success('Link copied');
  } catch {
    toast.error('Couldn’t copy the link');
  }
}

export function DocumentsList({
  projectId,
  documents,
  query,
}: {
  projectId: string;
  documents: DocumentSummary[];
  query: string;
}) {
  const canWrite = useProjectPermission('write');
  const [filter, setFilter] = useState<Filter>('active');
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const active = documents.filter((d) => !d.archivedAt);
  const archived = documents.filter((d) => d.archivedAt);
  const shown = filter === 'active' ? active : archived;

  const run = (action: Promise<{ ok: true } | { ok: false; error: string }>, success: string) =>
    startTransition(async () => {
      const result = await action;
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(success);
        router.refresh();
      }
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={filter}
          onValueChange={(value) => value && setFilter(value as Filter)}
          aria-label="Show active or archived documents"
        >
          <ToggleGroupItem value="active" className="gap-1.5 px-2.5 text-xs">
            Active <span className="text-muted-foreground tabular-nums">{active.length}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="archived" className="gap-1.5 px-2.5 text-xs">
            Archived <span className="text-muted-foreground tabular-nums">{archived.length}</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <DocumentSearch initial={query} />
        {canWrite && <NewDocumentMenu projectId={projectId} className="ml-auto" />}
      </div>

      {shown.length === 0 ? (
        query ? (
          <EmptyState icon={<SearchX />} title="No matching documents" description={`Nothing mentions “${query}”.`} />
        ) : filter === 'archived' ? (
          <EmptyState icon={<Archive />} title="No archived documents" />
        ) : (
          <EmptyState
            icon={<FileText />}
            title="No documents yet"
            description="Write specs, RFCs and meeting notes next to the issues they describe — edited together in real time."
            action={canWrite ? <NewDocumentMenu projectId={projectId} /> : undefined}
          />
        )
      ) : (
        <ul role="list" className="flex flex-col border-t border-border">
          {shown.map((doc) => (
            <li
              key={doc.id}
              className="group flex min-h-10 items-center gap-2 border-b border-border pr-1 hover:bg-accent/50 focus-within:bg-accent/50"
            >
              <Link
                href={documentPath(projectId, doc.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <DocumentIcon icon={doc.icon} />
                <span className="flex min-w-0 flex-1 items-baseline gap-3">
                  <span className="truncate font-medium">{doc.title}</span>
                  {doc.excerpt && (
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block">{doc.excerpt}</span>
                  )}
                </span>
                {doc.epic && (
                  <span className="hidden max-w-40 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground sm:flex">
                    <EpicIcon color={doc.epic.color} className="size-3.5" />
                    <span className="truncate">{doc.epic.name}</span>
                  </span>
                )}
                <span className="hidden w-6 shrink-0 md:block" title={doc.updatedBy ? `Last edited by ${doc.updatedBy.name}` : undefined}>
                  {doc.updatedBy && <Avatar name={doc.updatedBy.name} src={doc.updatedBy.image} size={20} />}
                </span>
                <time
                  dateTime={doc.updatedAt}
                  title={`Updated ${new Date(doc.updatedAt).toLocaleString()}`}
                  suppressHydrationWarning
                  className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                >
                  {relativeTime(new Date(doc.updatedAt))}
                </time>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${doc.title}`}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => copyDocumentLink(projectId, doc.id)}>
                    <Link2 />
                    Copy link
                  </DropdownMenuItem>
                  {canWrite && (
                    <>
                      {doc.archivedAt ? (
                        <DropdownMenuItem onSelect={() => run(unarchiveDocument({ id: doc.id }), 'Document restored')}>
                          <ArchiveRestore />
                          Unarchive
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => run(archiveDocument({ id: doc.id }), 'Document archived')}>
                          <Archive />
                          Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(doc)}>
                        <Trash2 />
                        Delete…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <DeleteDocumentDialog
        document={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => router.refresh()}
      />
    </div>
  );
}

function DocumentSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const push = (next: string) => {
    const q = next.trim();
    router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });
  };

  return (
    <label className="relative flex items-center">
      <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        placeholder="Search docs…"
        aria-label="Search documents"
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => push(next), 300);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            setValue('');
            push('');
          }
        }}
        className="h-7 w-48 rounded-md border border-input bg-transparent pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
      />
    </label>
  );
}

export function DeleteDocumentDialog({
  document,
  onOpenChange,
  onDeleted,
}: {
  document: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={document !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{document?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The document and its edit history are removed for everyone. This can’t be undone — archive it to keep a copy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              const target = document;
              if (!target) return;
              startTransition(async () => {
                const result = await deleteDocument({ id: target.id });
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success('Document deleted');
                  onDeleted();
                }
              });
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
