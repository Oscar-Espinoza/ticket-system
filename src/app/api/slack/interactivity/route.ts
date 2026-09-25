// Interactivity: the "Create issue" message shortcut and the Ask modal's
// submission. Verified by Slack's request signature. Submissions are validated
// inline (so errors show on the modal) and the issue is created in after();
// the shortcut acks and opens the modal in after().

import { after } from 'next/server';

import { ASK_VIEW_ID, MESSAGE_SHORTCUT_ID } from '@/lib/slack/config';
import { checkAskTarget, openAskModal, readAskContext, readAskValues, submitAsk } from '@/lib/slack/asks';
import { readSlackRequest } from '@/lib/slack/signature';

interface InteractionPayload {
  type?: string;
  callback_id?: string;
  trigger_id?: string;
  response_url?: string;
  team?: { id?: string; domain?: string } | null;
  user?: { id?: string; team_id?: string };
  channel?: { id?: string };
  message?: { text?: string; ts?: string };
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Parameters<typeof readAskValues>[0] };
  };
}

const ok = () => new Response(null, { status: 200 });

export async function POST(request: Request) {
  const body = await readSlackRequest(request);
  if (body instanceof Response) return body;

  let payload: InteractionPayload;
  try {
    payload = JSON.parse(new URLSearchParams(body).get('payload') ?? '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const teamId = payload.team?.id ?? payload.user?.team_id;
  const slackUserId = payload.user?.id;
  if (!teamId || !slackUserId) return ok();

  if (payload.type === 'message_action' && payload.callback_id === MESSAGE_SHORTCUT_ID) {
    const triggerId = payload.trigger_id;
    if (!triggerId) return ok();
    after(() =>
      openAskModal({
        teamId,
        slackUserId,
        triggerId,
        text: payload.message?.text ?? '',
        context: {
          c: payload.channel?.id,
          t: payload.message?.ts,
          d: payload.team?.domain,
          r: payload.response_url,
        },
      }),
    );
    return ok();
  }

  if (payload.type === 'view_submission' && payload.view?.callback_id === ASK_VIEW_ID) {
    const values = readAskValues(payload.view.state?.values);
    if ('errors' in values) return Response.json({ response_action: 'errors', errors: values.errors });
    const errors = await checkAskTarget(teamId, slackUserId, values.projectId).catch(() => ({
      project: 'Something went wrong. Try again.',
    }));
    if (errors) return Response.json({ response_action: 'errors', errors });
    const context = readAskContext(payload.view.private_metadata);
    after(() => submitAsk({ teamId, slackUserId, values, context }));
    return ok();
  }

  // Anything else (block actions, view_closed, …) needs only an ack.
  return ok();
}
