// GitHub webhook receiver (GH-03..06). Public endpoint: no session. A delivery
// is trusted only if its X-Hub-Signature-256 matches the per-project secret
// of a project connected to that hook / repository; everything after that is
// scoped to the verified project. Responds fast and does the work in after()
// (Vercel Hobby time limits; GitHub times out deliveries after 10s).

import { after } from 'next/server';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { verifySignature } from '@/lib/github/webhooks';
import {
  syncCheckRun,
  syncCheckSuite,
  syncPullRequest,
  syncPullRequestReview,
  syncPush,
  syncStatus,
  type SyncProject,
} from '@/lib/github/sync';

const MAX_BODY = 5 * 1024 * 1024;

const projectColumns = {
  id: projects.id,
  ticketKey: projects.ticketKey,
  githubWebhookSecret: projects.githubWebhookSecret,
  githubPrOpenStateId: projects.githubPrOpenStateId,
  githubPrMergeStateId: projects.githubPrMergeStateId,
  githubConnectedById: projects.githubConnectedById,
};

// Each handler reads only the payload fields it declares (GitHub's shapes).
const HANDLERS: Record<string, (project: SyncProject, payload: never) => Promise<void>> = {
  pull_request: syncPullRequest,
  push: syncPush,
  pull_request_review: syncPullRequestReview,
  check_suite: syncCheckSuite,
  check_run: syncCheckRun,
  status: syncStatus,
};

/** Projects this delivery could belong to: by hook id first (survives repo renames), else by repo. */
async function candidates(hookId: string | null, repo: string | undefined) {
  if (hookId) {
    const byHook = await db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.githubWebhookId, hookId));
    if (byHook.length) return byHook;
  }
  if (!repo) return [];
  return db
    .select(projectColumns)
    .from(projects)
    .where(sql`lower(${projects.githubRepo}) = lower(${repo})`);
}

export async function POST(request: Request) {
  const event = request.headers.get('x-github-event');
  const signature = request.headers.get('x-hub-signature-256');
  if (!event || !signature) {
    return Response.json({ error: 'Missing GitHub headers' }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: 'Payload too large' }, { status: 413 });

  let payload: { repository?: { full_name?: string } } & Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let verified: SyncProject[];
  try {
    const found = await candidates(
      request.headers.get('x-github-hook-id'),
      payload.repository?.full_name,
    );
    verified = found.filter(
      (project) =>
        project.githubWebhookSecret && verifySignature(raw, signature, project.githubWebhookSecret),
    );
  } catch (err) {
    console.error('[github-webhook] project lookup failed', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  // Same answer for "unknown repo" and "bad signature": reveals nothing.
  if (!verified.length) return Response.json({ error: 'Invalid signature' }, { status: 403 });

  if (event === 'ping') return Response.json({ ok: true });

  const delivery = request.headers.get('x-github-delivery') ?? 'unknown';
  const handler = Object.hasOwn(HANDLERS, event) ? HANDLERS[event] : null;
  if (handler) {
    after(async () => {
      for (const project of verified) {
        try {
          await handler(project, payload as never);
        } catch (err) {
          console.error(`[github-webhook] ${event} delivery ${delivery} failed`, err);
        }
      }
    });
  }
  return Response.json({ ok: true }, { status: 202 });
}
