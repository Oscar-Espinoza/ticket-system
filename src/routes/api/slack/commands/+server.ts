// Slash commands (`/ask <text>`). Verified by Slack's request signature; acks
// with an empty 200 at once and opens the modal in after() — Slack needs an
// answer within 3 s and the trigger_id expires 3 s after the command.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../_lib/options';

import { after } from '@/lib/kit/next-shims';
import { ASK_COMMAND } from '@/lib/slack/config';
import { openAskModal } from '@/lib/slack/asks';
import { readSlackRequest } from '@/lib/slack/signature';

export const POST: RequestHandler = async ({ request }) => {
  const body = await readSlackRequest(request);
  if (body instanceof Response) return body;

  const form = new URLSearchParams(body);
  const get = (key: string) => form.get(key) ?? '';
  if (get('command') !== ASK_COMMAND) {
    return Response.json({ response_type: 'ephemeral', text: `Unknown command ${get('command')}` });
  }
  const teamId = get('team_id');
  const slackUserId = get('user_id');
  const triggerId = get('trigger_id');
  if (!teamId || !slackUserId || !triggerId) return new Response('Bad request', { status: 400 });

  after(() =>
    openAskModal({
      teamId,
      slackUserId,
      triggerId,
      text: get('text'),
      context: { c: get('channel_id') || undefined, r: get('response_url') || undefined },
    }),
  );
  return new Response(null, { status: 200 });
};

// Next answered OPTIONS automatically (204 + Allow); Kit would 405.
export const OPTIONS = allowOptions('POST');
