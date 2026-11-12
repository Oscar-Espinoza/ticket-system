// GitHub webhook receiver. Public endpoint: no session. A delivery
// is trusted only if its X-Hub-Signature-256 matches the per-project secret
// of a project connected to that hook / repository; everything after that is
// scoped to the verified project. Stores the delivery (src/lib/vcs/inbound.ts)
// before answering 202 and does the work in after() (Vercel Hobby time limits;
// GitHub times out deliveries after 10s); unfinished work is retried from the
// stored row. 500 when it cannot be stored.

import { eq, sql } from 'drizzle-orm';

import type { RequestHandler } from './$types';
import { allowOptions } from '../../_lib/options';

import { after } from '@/lib/kit/request';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { verifyHmac } from '@/lib/server/secrets';
import { readWebhookBody } from '@/lib/vcs/webhook-request';
import { handlesEvent, processInbound, recordInbound } from '@/lib/vcs/inbound';

const projectColumns = {
  id: projects.id,
  githubWebhookSecret: projects.githubWebhookSecret,
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

export const POST: RequestHandler = async ({ request }) => {
  const event = request.headers.get('x-github-event');
  const signature = request.headers.get('x-hub-signature-256');
  if (!event || !signature) {
    return Response.json({ error: 'Missing GitHub headers' }, { status: 403 });
  }

  const body = await readWebhookBody(request);
  if (!body.ok) return body.response;
  const { raw } = body;
  const payload = body.payload as { repository?: { full_name?: string } } & Record<string, unknown>;

  let verified: { id: string }[];
  try {
    const found = await candidates(
      request.headers.get('x-github-hook-id'),
      payload.repository?.full_name,
    );
    verified = found.filter(
      (project) =>
        project.githubWebhookSecret && verifyHmac(signature, raw, project.githubWebhookSecret, 'sha256='),
    );
  } catch (err) {
    console.error('[github-webhook] project lookup failed', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  // Same answer for "unknown repo" and "bad signature": reveals nothing.
  if (!verified.length) return Response.json({ error: 'Invalid signature' }, { status: 403 });

  if (event === 'ping') return Response.json({ ok: true });

  if (!handlesEvent('github', event)) return Response.json({ ok: true }, { status: 202 });
  let rows: Awaited<ReturnType<typeof recordInbound>>;
  try {
    rows = await recordInbound({
      provider: 'github',
      deliveryId: request.headers.get('x-github-delivery'),
      event,
      payload,
      targets: verified.map((project) => ({ projectId: project.id })),
    });
  } catch (err) {
    console.error('[github-webhook] could not store the delivery', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  after(() => processInbound(rows));
  return Response.json({ ok: true }, { status: 202 });
};

export const OPTIONS = allowOptions('POST');
