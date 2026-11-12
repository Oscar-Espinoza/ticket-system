// Bitbucket Cloud webhook receiver. Public endpoint: the URL names one
// project_integration row and the delivery is trusted only when its
// `X-Hub-Signature: sha256=…` HMAC matches that row's secret (timing-safe).
// The delivery is stored before the 202 (src/lib/vcs/inbound.ts) and the work
// runs in after(); unfinished work is retried from the stored row. 500 when it
// cannot be stored.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../../_lib/options';

import { after } from '@/lib/kit/request';
import { getWebhookIntegration, type BitbucketConfig } from '@/lib/vcs/integrations';
import { handlesEvent, processInbound, recordInbound } from '@/lib/vcs/inbound';
import { verifyHmac } from '@/lib/server/secrets';
import { readWebhookBody, rejected } from '@/lib/vcs/webhook-request';

export const POST: RequestHandler = async ({ request, params }) => {
  const { integrationId } = params;
  const signature = request.headers.get('x-hub-signature');
  if (!signature) return rejected();

  const body = await readWebhookBody(request);
  if (!body.ok) return body.response;

  let found: Awaited<ReturnType<typeof getWebhookIntegration<BitbucketConfig>>>;
  try {
    found = await getWebhookIntegration<BitbucketConfig>(integrationId, 'bitbucket');
  } catch (err) {
    console.error('[bitbucket-webhook] lookup failed', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  const secret = found?.integration.secret;
  if (!found || !secret || !verifyHmac(signature, body.raw, secret, 'sha256=')) return rejected();

  const event = request.headers.get('x-event-key') ?? '';
  if (!handlesEvent('bitbucket', event)) return Response.json({ ok: true }, { status: 202 });
  let rows: Awaited<ReturnType<typeof recordInbound>>;
  try {
    rows = await recordInbound({
      provider: 'bitbucket',
      deliveryId: request.headers.get('x-request-uuid'),
      event,
      payload: body.payload,
      targets: [{ projectId: found.project.id, integrationId: found.integration.id }],
    });
  } catch (err) {
    console.error('[bitbucket-webhook] could not store the delivery', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  after(() => processInbound(rows));
  return Response.json({ ok: true }, { status: 202 });
};

export const OPTIONS = allowOptions('POST');
