// The pure reconcile decision of the collaborative editor. Plain module (no runes, no Svelte) so a test can import it.

import type { CollabProjection } from '@/lib/collab/codec';

/**
 * What to reconcile the opened doc against. Issue keys carry the server's
 * current description and its last writer (projection): our own projection
 * means the doc is at least as new; any other writer means the doc never saw
 * that edit. Without a projection (documents) the caller's choice stands.
 */
export function reconcileTarget(
  projection: CollabProjection | undefined,
  markdown: string,
  truth: 'markdown' | 'collab',
  docAdoptedRev: number | null = null,
): { stored: string; winner: 'markdown' | 'collab' } {
  if (!projection) return { stored: markdown, winner: truth };
  const fromCollab =
    projection.source === 'collab' ||
    // The doc already adopted this very external write (another editor did;
    // its server marker may still be in flight): the doc is at least as new.
    (docAdoptedRev !== null && docAdoptedRev === projection.rev);
  return { stored: projection.markdown, winner: fromCollab ? 'collab' : 'markdown' };
}
