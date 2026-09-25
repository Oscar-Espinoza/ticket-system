// Sentry internal-integration webhook receiver. Public endpoint: the URL names
// one project_integration row and the delivery is trusted only when
// Sentry-Hook-Signature (HMAC-SHA256 with the integration's client secret)
// matches, timing-safe. Work runs in after(); Sentry expects a fast 2xx.

import { after } from 'next/server';

import { handleSentryWebhook, verifySentrySignature } from '@/lib/sentry/webhook';
import { getWebhookIntegration } from '@/lib/vcs/integrations';
import { decryptToken } from '@/lib/vcs/secrets';
import { readJsonBody, rejected } from '@/lib/vcs/webhook-request';

export async function POST(request: Request, ctx: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await ctx.params;
  const signature = request.headers.get('sentry-hook-signature');
  if (!signature) return rejected();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  let found: Awaited<ReturnType<typeof getWebhookIntegration>>;
  try {
    found = await getWebhookIntegration(integrationId, 'sentry');
  } catch (err) {
    console.error('[sentry-webhook] lookup failed', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  const secret = found?.integration.secret;
  if (!found || !secret || !verifySentrySignature(body.raw, body.payload, signature, secret)) {
    return rejected();
  }

  const resource = request.headers.get('sentry-hook-resource') ?? '';
  const { project, integration } = found;
  after(async () => {
    try {
      await handleSentryWebhook(project, resource, body.payload, await decryptToken(integration.token));
    } catch (err) {
      console.error(`[sentry-webhook] ${resource} failed`, err);
    }
  });
  return Response.json({ ok: true }, { status: 202 });
}
