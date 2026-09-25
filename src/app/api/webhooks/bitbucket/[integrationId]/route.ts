// Bitbucket Cloud webhook receiver. Public endpoint: the URL names one
// project_integration row and the delivery is trusted only when its
// `X-Hub-Signature: sha256=…` HMAC matches that row's secret (timing-safe).
// Work runs in after() so Bitbucket gets a fast 202.

import { after } from 'next/server';

import { verifySignature } from '@/lib/github/webhooks';
import { syncBitbucketEvent } from '@/lib/vcs/bitbucket-sync';
import { getWebhookIntegration, type BitbucketConfig } from '@/lib/vcs/integrations';
import { decryptToken } from '@/lib/vcs/secrets';
import { readJsonBody, rejected } from '@/lib/vcs/webhook-request';

export async function POST(request: Request, ctx: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await ctx.params;
  const signature = request.headers.get('x-hub-signature');
  if (!signature) return rejected();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  let found: Awaited<ReturnType<typeof getWebhookIntegration<BitbucketConfig>>>;
  try {
    found = await getWebhookIntegration<BitbucketConfig>(integrationId, 'bitbucket');
  } catch (err) {
    console.error('[bitbucket-webhook] lookup failed', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  const secret = found?.integration.secret;
  if (!found || !secret || !verifySignature(body.raw, signature, secret)) return rejected();

  const event = request.headers.get('x-event-key') ?? '';
  const { project, integration } = found;
  after(async () => {
    try {
      const token = await decryptToken(integration.token);
      const auth = token ? { token, username: integration.config.username ?? null } : null;
      await syncBitbucketEvent(project, integration.config, event, body.payload, auth);
    } catch (err) {
      console.error(`[bitbucket-webhook] ${event} failed`, err);
    }
  });
  return Response.json({ ok: true }, { status: 202 });
}
