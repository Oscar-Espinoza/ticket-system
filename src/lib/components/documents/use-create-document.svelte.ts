// useCreateDocument:
//   const doc = useCreateDocument(projectId | () => projectId, epicId? | () => epicId)
//   doc.create(template); doc.pending (reactive)
// createDocument's wrapper refreshes the page (refreshesData); then
// we navigate to the new document.

import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';

import { createDocument } from '@/lib/actions/documents';
import { documentPath, type DocumentTemplateId } from '@/lib/document-model';

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T => (typeof value === 'function' ? (value as () => T)() : value);

export function useCreateDocument(
  projectId: MaybeGetter<string>,
  epicId?: MaybeGetter<string | null | undefined>,
): { create: (template: DocumentTemplateId) => void; readonly pending: boolean } {
  let pending = $state(false);
  const create = (template: DocumentTemplateId) => {
    const project = read(projectId);
    const epic = epicId === undefined ? undefined : read(epicId);
    pending = true;
    void (async () => {
      try {
        const result = await createDocument({ projectId: project, template, epicId: epic ?? undefined });
        if (!result.ok) toast.error(result.error);
        else await goto(documentPath(project, result.id));
      } finally {
        pending = false;
      }
    })();
  };
  return {
    create,
    get pending() {
      return pending;
    },
  };
}
