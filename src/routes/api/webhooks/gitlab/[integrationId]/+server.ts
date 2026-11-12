// GitLab project hook receiver. Public endpoint: the URL names one
// project_integration row and the delivery is trusted only when X-Gitlab-Token
// matches its secret (timing-safe). The delivery is stored before the 202
// (src/lib/vcs/inbound.ts) and the work runs in after() so GitLab gets a fast
// answer (it disables hooks that keep timing out); unfinished work is retried
// from the stored row. 500 when it cannot be stored.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../../_lib/options';

import { after } from '@/lib/kit/request';
import { getWebhookIntegration, type GitlabConfig } from '@/lib/vcs/integrations';
import { handlesEvent, processInbound, recordInbound } from '@/lib/vcs/inbound';
import { safeEqual } from '@/lib/server/secrets';
import { readWebhookBody, rejected } from '@/lib/vcs/webhook-request';

export const POST: RequestHandler = async ({ request, params }) => {
  const { integrationId } = params;
  const token = request.headers.get('x-gitlab-token');
  if (!token) return rejected();

  let found: Awaited<ReturnType<typeof getWebhookIntegration<GitlabConfig>>>;
  try {
    found = await getWebhookIntegration<GitlabConfig>(integrationId, 'gitlab');
  } catch (err) {
    console.error('[gitlab-webhook] lookup failed', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!found || !safeEqual(token, found.integration.secret)) return rejected();

  const body = await readWebhookBody(request);
  if (!body.ok) return body.response;

  const event = request.headers.get('x-gitlab-event') ?? '';
  if (!handlesEvent('gitlab', event)) return Response.json({ ok: true }, { status: 202 });
  let rows: Awaited<ReturnType<typeof recordInbound>>;
  try {
    rows = await recordInbound({
      provider: 'gitlab',
      deliveryId: request.headers.get('x-gitlab-event-uuid'),
      event,
      payload: body.payload,
      targets: [{ projectId: found.project.id, integrationId: found.integration.id }],
    });
  } catch (err) {
    console.error('[gitlab-webhook] could not store the delivery', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
  after(() => processInbound(rows));
  return Response.json({ ok: true }, { status: 202 });
};

export const OPTIONS = allowOptions('POST');
