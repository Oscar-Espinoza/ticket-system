// GitLab project hook receiver. Public endpoint: the URL names one
// project_integration row and the delivery is trusted only when X-Gitlab-Token
// matches its secret (timing-safe). Work runs in after() so GitLab gets a fast
// 202 (it disables hooks that keep timing out).

import { after } from 'next/server';

import { syncGitlabHook, type GitlabHook } from '@/lib/vcs/gitlab-sync';
import { getWebhookIntegration, type GitlabConfig } from '@/lib/vcs/integrations';
import { safeEqual } from '@/lib/vcs/secrets';
import { readJsonBody, rejected } from '@/lib/vcs/webhook-request';

const HANDLED = new Set(['Merge Request Hook', 'Push Hook', 'Pipeline Hook']);

export async function POST(request: Request, ctx: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await ctx.params;
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

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const event = request.headers.get('x-gitlab-event') ?? '';
  if (HANDLED.has(event)) {
    const { project, integration } = found;
    after(async () => {
      try {
        await syncGitlabHook(project, integration.config, body.payload as GitlabHook);
      } catch (err) {
        console.error(`[gitlab-webhook] ${event} failed`, err);
      }
    });
  }
  return Response.json({ ok: true }, { status: 202 });
}
