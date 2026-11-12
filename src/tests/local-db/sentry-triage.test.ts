import { describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

// No after-response fan-out: only the committed rows matter here.
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { attachments, projects, tickets } from '@/db/schema';
import { handleSentryWebhook } from '@/lib/sentry/webhook';
import { localDb, makeProject, makeUser } from './fixtures';

const alert = (sentryId: string) => ({
  action: 'triggered',
  data: {
    triggered_rule: 'Errors',
    event: {
      issue_id: sentryId,
      web_url: `https://acme.sentry.io/organizations/acme/issues/${sentryId}/events/abc/`,
      title: `TypeError ${sentryId}`,
      culprit: 'app.js',
      level: 'error',
    },
  },
});

async function setup(label: string) {
  const user = await makeUser(label);
  const projectId = await makeProject(user, label.toUpperCase());
  const [project] = await db.select({ id: projects.id, ticketKey: projects.ticketKey }).from(projects).where(eq(projects.id, projectId));
  const triage = async () => {
    const issues = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.projectId, projectId));
    const links = issues.length
      ? await db.select({ ticketId: attachments.ticketId }).from(attachments).innerJoin(tickets, eq(tickets.id, attachments.ticketId)).where(eq(tickets.projectId, projectId))
      : [];
    return { issues: issues.length, links: links.length };
  };
  return { project, triage };
}

describe.skipIf(!localDb)('Sentry triage opens one issue per Sentry issue (gap D item 3)', () => {
  it('a failure between the issue and its link leaves nothing; the next alert opens it once', async () => {
    const { project, triage } = await setup('stf');
    const sentryId = String(Date.now());
    const url = `https://acme.sentry.io/organizations/acme/issues/${sentryId}/`;
    // The link cannot be written (a trigger refuses it, for this Sentry issue only).
    const guard = `refuse_sentry_link_${sentryId}`;
    await db.execute(
      sql.raw(`create function ${guard}() returns trigger language plpgsql as $$ begin raise exception 'link refused'; end $$`),
    );
    await db.execute(
      sql.raw(`create trigger ${guard} before insert on attachment for each row when (new.url = '${url}') execute function ${guard}()`),
    );
    try {
      await expect(handleSentryWebhook(project, 'event_alert', alert(sentryId), null)).rejects.toThrow();
      expect(await triage()).toEqual({ issues: 0, links: 0 });
    } finally {
      await db.execute(sql.raw(`drop trigger ${guard} on attachment`));
      await db.execute(sql.raw(`drop function ${guard}()`));
    }

    await handleSentryWebhook(project, 'event_alert', alert(sentryId), null);
    expect(await triage()).toEqual({ issues: 1, links: 1 });
    await handleSentryWebhook(project, 'event_alert', alert(sentryId), null);
    expect(await triage()).toEqual({ issues: 1, links: 1 });
  });

  it('two alerts at once for the same Sentry issue open one issue', async () => {
    const { project, triage } = await setup('stc');
    const sentryId = String(Date.now() + 1);
    await Promise.all([
      handleSentryWebhook(project, 'event_alert', alert(sentryId), null),
      handleSentryWebhook(project, 'event_alert', alert(sentryId), null),
      handleSentryWebhook(project, 'event_alert', alert(sentryId), null),
    ]);
    expect(await triage()).toEqual({ issues: 1, links: 1 });
  });

  it('a trashed triage issue does not swallow the next alert', async () => {
    const { project, triage } = await setup('stt');
    const sentryId = String(Date.now() + 2);
    await handleSentryWebhook(project, 'event_alert', alert(sentryId), null);
    await db.update(tickets).set({ deletedAt: new Date() }).where(and(eq(tickets.projectId, project.id)));
    await handleSentryWebhook(project, 'event_alert', alert(sentryId), null);
    expect(await triage()).toEqual({ issues: 2, links: 2 });
    // Trashed again, then two alerts at once: still one fresh issue.
    await db.update(tickets).set({ deletedAt: new Date() }).where(and(eq(tickets.projectId, project.id)));
    await Promise.all([
      handleSentryWebhook(project, 'event_alert', alert(sentryId), null),
      handleSentryWebhook(project, 'event_alert', alert(sentryId), null),
    ]);
    expect(await triage()).toEqual({ issues: 3, links: 3 });
  });
});
