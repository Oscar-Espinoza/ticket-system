// Remote-function wrapper for src/components/editor/actions.ts (`'use server'`).
// That file lives under src/components, so scripts/gen-remote-actions.mjs
// (which scans src/app) doesn't generate it; this is the same thin wrapper,
// calling the SAME function body with the SAME argument. suggestIssues never
// redirects or revalidates, so no settle()/refresh step is needed.
//
// Client usage: `await suggestIssues({ projectId, query })` (a command: event
// handlers / editor callbacks only, never during render).

import { command } from '$app/server';

import * as impl from '@/components/editor/actions';

export const suggestIssues = command('unchecked', (input: Parameters<typeof impl.suggestIssues>[0]) =>
  impl.suggestIssues(input),
);
