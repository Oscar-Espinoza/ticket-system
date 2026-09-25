// Events API: the URL verification handshake, plus uninstall / token
// revocation so a removed app doesn't leave a dead bot token behind.

import { deleteInstallation } from '@/lib/slack/installations';
import { readSlackRequest } from '@/lib/slack/signature';

interface EventPayload {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: { type?: string; tokens?: { bot?: string[] } };
}

export async function POST(request: Request) {
  const body = await readSlackRequest(request);
  if (body instanceof Response) return body;

  let payload: EventPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge ?? '' });
  }

  const event = payload.event?.type;
  const teamId = payload.team_id;
  const botRevoked = event === 'tokens_revoked' && (payload.event?.tokens?.bot?.length ?? 0) > 0;
  if (teamId && (event === 'app_uninstalled' || botRevoked)) {
    try {
      await deleteInstallation(teamId);
    } catch (err) {
      console.error('[slack] failed to delete installation', err);
      return new Response('Internal error', { status: 500 });
    }
  }
  return new Response(null, { status: 200 });
}
