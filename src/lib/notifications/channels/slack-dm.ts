// Slack DM channel: users who linked their Slack account (and left DM
// notifications on) get their new inbox rows as ONE compact bot DM per
// workspace per batch. Opens the IM with conversations.open, then
// chat.postMessage. Sequential per workspace; a rate limit (429) skips the rest
// of that workspace's batch rather than queueing. Never throws.

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { slackInstallations, slackUserLinks } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import { describeNotification, notificationData, notificationPath } from '@/lib/notifications/types';
import { decryptToken } from '@/lib/server/crypto';
import { slackApi } from '@/lib/slack/api';
import { slackConfig } from '@/lib/slack/config';
import { slackEscape } from '@/lib/slack/format';

import type { ActorNames, ChannelNotification } from './index';

const MAX_LINES = 10;

/** `rows` are due now (the entry point drops snoozed ones). */
export async function deliverSlackDm(rows: ChannelNotification[], actorNames: ActorNames): Promise<void> {
  try {
    if (rows.length === 0 || !slackConfig()) return;
    await deliver(rows, actorNames);
  } catch (err) {
    console.error('[slack-dm] delivery failed', err);
  }
}

async function deliver(rows: ChannelNotification[], loadActorNames: ActorNames) {
  const userIds = [...new Set(rows.map((row) => row.userId))];
  const links = await db
    .select({
      userId: slackUserLinks.userId,
      teamId: slackUserLinks.teamId,
      slackUserId: slackUserLinks.slackUserId,
      botToken: slackInstallations.botToken,
    })
    .from(slackUserLinks)
    .innerJoin(slackInstallations, eq(slackInstallations.teamId, slackUserLinks.teamId))
    .where(and(inArray(slackUserLinks.userId, userIds), eq(slackUserLinks.notify, true)));
  if (links.length === 0) return;

  const linkedIds = new Set(links.map((link) => link.userId));
  const actorName = await loadActorNames();

  const rowsByUser = new Map<string, ChannelNotification[]>();
  for (const row of rows) {
    if (!linkedIds.has(row.userId)) continue;
    rowsByUser.set(row.userId, [...(rowsByUser.get(row.userId) ?? []), row]);
  }

  const byTeam = new Map<string, typeof links>();
  for (const link of links) byTeam.set(link.teamId, [...(byTeam.get(link.teamId) ?? []), link]);

  const origin = appUrl();
  await Promise.allSettled(
    [...byTeam.values()].map(async (teamLinks) => {
      const token = await decryptToken(teamLinks[0].botToken);
      if (!token) return;
      for (const link of teamLinks) {
        const list = rowsByUser.get(link.userId);
        if (!list?.length) continue;
        const text = messageText(list, actorName, origin);
        const im = await slackApi('conversations.open', token, { users: link.slackUserId });
        if (im.error === 'ratelimited') return;
        const channel = (im.channel as { id?: string } | undefined)?.id;
        if (!im.ok || !channel) continue;
        const sent = await slackApi('chat.postMessage', token, { channel, text, unfurl_links: false });
        if (sent.error === 'ratelimited') return;
        if (!sent.ok) console.error('[slack-dm] chat.postMessage failed', sent.error);
      }
    }),
  );
}

function messageText(list: ChannelNotification[], actorName: Map<string, string>, origin: string): string {
  const lines = list.slice(0, MAX_LINES).map((row) => {
    const data = notificationData(row.data);
    const actor = row.actorId ? (actorName.get(row.actorId) ?? null) : null;
    const sentence = slackEscape(describeNotification(row.type, data, actor));
    const url = `${origin}${notificationPath(row.projectId, data)}`;
    if (!data.key) return `<${url}|${sentence}>`;
    const title = data.title ? ` ${slackEscape(data.title)}` : '';
    const excerpt = data.excerpt ? `\n>${slackEscape(data.excerpt)}` : '';
    return `*<${url}|${data.key}>*${title} — ${sentence}${excerpt}`;
  });
  if (list.length > MAX_LINES) lines.push(`_and ${list.length - MAX_LINES} more in <${origin}/dashboard/inbox|your inbox>_`);
  return lines.join('\n');
}
