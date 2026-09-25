'use client';

// Documents linked to an epic, for the epic detail page (B8/D4b own it — they
// render this with `documentsForEpic(epicId, userId)` from src/lib/documents).
// "New doc" creates a blank document already linked to the epic.

import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';

import { relativeTime } from '@/components/issues/issue-properties';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { DocumentIcon } from './document-icon';
import { documentPath, type DocumentSummary } from './document-model';
import { useCreateDocument } from './new-document-menu';

export function EpicDocuments({
  projectId,
  epicId,
  documents,
}: {
  projectId: string;
  epicId: string;
  documents: DocumentSummary[];
}) {
  const canWrite = useProjectPermission('write');
  const { create, pending } = useCreateDocument(projectId, epicId);

  return (
    <section aria-labelledby={`epic-docs-${epicId}`} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h2 id={`epic-docs-${epicId}`} className="text-xs font-medium text-muted-foreground">
          Documents
        </h2>
        {canWrite && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto size-6"
            aria-label="New document in this epic"
            disabled={pending}
            onClick={() => create('blank')}
          >
            <Plus />
          </Button>
        )}
      </div>
      {documents.length === 0 ? (
        <p className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden />
          No documents yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={documentPath(doc.projectId, doc.id)}
                className="flex h-8 items-center gap-2 rounded-md px-1 text-sm hover:bg-accent/50"
              >
                <DocumentIcon icon={doc.icon} />
                <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {relativeTime(new Date(doc.updatedAt))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
