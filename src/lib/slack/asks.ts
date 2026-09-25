// Linear-style Asks: `/ask` and the "Create issue" message shortcut open a
// modal; submitting it files an issue through the issue service. Linked Slack
// users file as their app user into any project they can write to; unlinked
// ones can only file into the workspace's default project, as the system actor.
// Everything here runs in after() — Slack already got its ack.

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { customerRequests, projectMembers, projects, workflowStates } from '@/db/schema';
import { matchCustomerByEmail } from '@/lib/customers';
import { createIssue, DESCRIPTION_MAX, SYSTEM_ACTOR, TITLE_MAX } from '@/lib/issue-service';
import { isPriority, PRIORITY_LABEL, PRIORITY_ORDER, type Priority } from '@/lib/issue-model';
import { stripMentions } from '@/lib/mentions';
import { firstStateOfType } from '@/lib/workflow';
import { absoluteIssueUrl, appUrl } from '@/lib/integrations/app-url';
import { slackEscape } from '@/lib/integrations/slack';
import { roleAllows } from '@/lib/roles';

import { respond, slackApi } from './api';
import { ASK_VIEW_ID } from './config';
import { getInstallation, linkedUserId, type SlackInstall } from './installations';

const WRITE_ROLES = (['owner', 'admin', 'member', 'guest'] as const).filter((role) =>
  roleAllows(role, 'write'),
);
const MAX_OPTIONS = 100; // Slack static_select limit
const MODAL_DESCRIPTION_MAX = 3000; // Slack plain_text_input limit

/** Where the modal was opened from; round-trips through private_metadata. */
export interface AskContext {
  /** Slack channel id. */
  c?: string;
  /** Message ts (message shortcut). */
  t?: string;
  /** Workspace domain, for building a permalink when chat.getPermalink can't. */
  d?: string;
  /** response_url for the ephemeral reply. */
  r?: string;
}

export interface AskProject {
  id: string;
  name: string;
  ticketKey: string;
}

export const settingsUrl = () => `${appUrl()}/dashboard/settings/slack`;

/** Slack mrkdwn → markdown-ish plain text: links, user/channel refs, entities. */
export function fromSlackText(text: string): string {
  return text
    .replace(/<([^<>|]+)\|([^<>]+)>/g, (_, target: string, label: string) => {
      if (target.startsWith('#')) return `#${label.replace(/^#/, '')}`;
      if (target.startsWith('@') || target.startsWith('!')) return `@${label.replace(/^@/, '')}`;
      return `[${label}](${target})`;
    })
    .replace(/<([@#!][^<>]+)>/g, (_, ref: string) => (ref.startsWith('!') ? `@${ref.slice(1)}` : ref))
    .replace(/<([^<>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** First line → title, the rest → description. */
export function splitAskText(text: string): { title: string; description: string } {
  const clean = stripMentions(fromSlackText(text)).trim();
  const [first = '', ...rest] = clean.split('\n');
  const title = first.trim();
  if (title.length <= TITLE_MAX) return { title, description: rest.join('\n').trim() };
  // One long line: keep all of it in the description, cut the title at a word.
  const cut = title.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, '');
  return { title: `${cut || title.slice(0, TITLE_MAX - 1)}…`, description: clean };
}

/** Projects a Slack user may file into. */
export async function askProjects(install: SlackInstall, userId: string | null): Promise<AskProject[]> {
  const columns = { id: projects.id, name: projects.name, ticketKey: projects.ticketKey };
  if (!userId) {
    if (!install.defaultProjectId) return [];
    return db.select(columns).from(projects).where(eq(projects.id, install.defaultProjectId)).limit(1);
  }
  return db
    .select(columns)
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.role, WRITE_ROLES)))
    .orderBy(asc(projects.name))
    .limit(MAX_OPTIONS);
}

const plain = (text: string) => ({ type: 'plain_text', text: text.slice(0, 75), emoji: true });
const option = (text: string, value: string) => ({ text: plain(text), value });

function askModal(input: {
  projects: AskProject[];
  initialProjectId: string | null;
  title: string;
  description: string;
  linked: boolean;
  context: AskContext;
}) {
  const projectOptions = input.projects.map((p) => option(`${p.name} (${p.ticketKey})`, p.id));
  const initialProject =
    projectOptions.find((o) => o.value === input.initialProjectId) ?? projectOptions[0];
  const priorityOptions = PRIORITY_ORDER.map((p) => option(PRIORITY_LABEL[p], p));
  const title = input.title.slice(0, TITLE_MAX);
  const description = input.description.slice(0, MODAL_DESCRIPTION_MAX);

  return {
    type: 'modal',
    callback_id: ASK_VIEW_ID,
    private_metadata: JSON.stringify(input.context).slice(0, 3000),
    title: plain('Create issue'),
    submit: plain('Create'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: 'title',
        label: plain('Title'),
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          max_length: TITLE_MAX,
          placeholder: plain('Issue title'),
          ...(title ? { initial_value: title } : {}),
        },
      },
      {
        type: 'input',
        block_id: 'description',
        optional: true,
        label: plain('Description'),
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          multiline: true,
          max_length: MODAL_DESCRIPTION_MAX,
          placeholder: plain('Add details…'),
          ...(description ? { initial_value: description } : {}),
        },
      },
      {
        type: 'input',
        block_id: 'project',
        label: plain('Project'),
        element: {
          type: 'static_select',
          action_id: 'value',
          options: projectOptions,
          ...(initialProject ? { initial_option: initialProject } : {}),
        },
      },
      {
        type: 'input',
        block_id: 'priority',
        label: plain('Priority'),
        element: {
          type: 'static_select',
          action_id: 'value',
          options: priorityOptions,
          initial_option: priorityOptions.find((o) => o.value === 'none'),
        },
      },
      ...(input.linked
        ? []
        : [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Filed to triage on your behalf. <${settingsUrl()}|Link your Slack account> to file as yourself in any of your projects.`,
                },
              ],
            },
          ]),
    ],
  };
}

async function tell(install: SlackInstall | null, slackUserId: string, context: AskContext, text: string) {
  if (context.r && (await respond(context.r, { response_type: 'ephemeral', replace_original: false, text }))) {
    return;
  }
  // No usable response_url: DM the user instead.
  if (!install) return;
  const im = await slackApi('conversations.open', install.token, { users: slackUserId });
  const channel = (im.channel as { id?: string } | undefined)?.id;
  if (im.ok && channel) await slackApi('chat.postMessage', install.token, { channel, text });
}

/** `/ask` and the message shortcut: open the modal (or explain why not). */
export async function openAskModal(input: {
  teamId: string;
  slackUserId: string;
  triggerId: string;
  text: string;
  context: AskContext;
}): Promise<void> {
  try {
    const install = await getInstallation(input.teamId);
    if (!install) {
      await tell(null, input.slackUserId, input.context, `This Slack workspace isn't connected yet. Add the app from ${settingsUrl()}`);
      return;
    }
    const userId = await linkedUserId(install.teamId, input.slackUserId);
    const options = await askProjects(install, userId);
    if (options.length === 0) {
      await tell(
        install,
        input.slackUserId,
        input.context,
        userId
          ? "You don't have write access to any project yet."
          : `Asks aren't set up for this workspace yet: <${settingsUrl()}|link your Slack account> or ask an admin to pick a default project.`,
      );
      return;
    }
    const { title, description } = splitAskText(input.text);
    const view = askModal({
      projects: options,
      initialProjectId: install.defaultProjectId,
      title,
      description,
      linked: !!userId,
      context: input.context,
    });
    const res = await slackApi('views.open', install.token, { trigger_id: input.triggerId, view });
    if (!res.ok) {
      console.error('[slack] views.open failed', res.error);
      await tell(install, input.slackUserId, input.context, 'Slack took too long to open the form. Try again.');
    }
  } catch (err) {
    console.error('[slack] openAskModal failed', err);
  }
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

type StateValues = Record<string, Record<string, { value?: string | null; selected_option?: { value?: string } | null }>>;

export interface AskValues {
  title: string;
  description: string;
  projectId: string;
  priority: Priority;
}

export function readAskValues(values: StateValues | undefined): AskValues | { errors: Record<string, string> } {
  const get = (block: string) => values?.[block]?.value;
  const title = stripMentions(get('title')?.value ?? '').trim();
  const description = stripMentions(get('description')?.value ?? '').trim();
  const projectId = get('project')?.selected_option?.value ?? '';
  const priority = get('priority')?.selected_option?.value;
  const errors: Record<string, string> = {};
  if (!title) errors.title = 'Give the issue a title.';
  if (!projectId) errors.project = 'Pick a project.';
  if (Object.keys(errors).length) return { errors };
  return { title: title.slice(0, TITLE_MAX), description, projectId, priority: isPriority(priority) ? priority : 'none' };
}

export function readAskContext(raw: unknown): AskContext {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return { c: str(parsed.c), t: str(parsed.t), d: str(parsed.d), r: str(parsed.r) };
  } catch {
    return {};
  }
}

async function permalink(install: SlackInstall, context: AskContext): Promise<string | null> {
  if (!context.c || !context.t) return null;
  const res = await slackApi('chat.getPermalink', install.token, { channel: context.c, message_ts: context.t });
  if (res.ok && typeof res.permalink === 'string') return res.permalink;
  // Private channels the bot isn't in: Slack's archive URL format still resolves for members.
  return context.d && /^[\w-]+$/.test(context.d) && /^\d+\.\d+$/.test(context.t)
    ? `https://${context.d}.slack.com/archives/${context.c}/p${context.t.replace('.', '')}`
    : null;
}

async function slackProfile(install: SlackInstall, slackUserId: string) {
  const res = await slackApi('users.info', install.token, { user: slackUserId });
  const user = res.ok ? (res.user as { real_name?: string; name?: string; profile?: { email?: string; real_name?: string } }) : null;
  return {
    name: user?.profile?.real_name || user?.real_name || user?.name || null,
    email: user?.profile?.email || null,
  };
}

/**
 * Checks a submission can go ahead (for inline modal errors). Returns the
 * block errors, or null when it's valid.
 */
export async function checkAskTarget(
  teamId: string,
  slackUserId: string,
  projectId: string,
): Promise<Record<string, string> | null> {
  const install = await getInstallation(teamId);
  if (!install) return { project: 'This workspace is no longer connected.' };
  const userId = await linkedUserId(teamId, slackUserId);
  const allowed = await askProjects(install, userId);
  return allowed.some((p) => p.id === projectId) ? null : { project: "You can't file issues in this project." };
}

export async function submitAsk(input: {
  teamId: string;
  slackUserId: string;
  values: AskValues;
  context: AskContext;
}): Promise<void> {
  let install: SlackInstall | null = null;
  try {
    install = await getInstallation(input.teamId);
    if (!install) return;
    const { values, context } = input;
    const userId = await linkedUserId(install.teamId, input.slackUserId);
    // Re-authorize: access may have changed since the modal opened.
    const allowed = await askProjects(install, userId);
    if (!allowed.some((p) => p.id === values.projectId)) {
      await tell(install, input.slackUserId, context, "Couldn't create the issue: you can't file issues in that project.");
      return;
    }

    const [[project], states, link, profile] = await Promise.all([
      db
        .select({ id: projects.id, triageEnabled: projects.triageEnabled })
        .from(projects)
        .where(eq(projects.id, values.projectId))
        .limit(1),
      db
        .select({
          id: workflowStates.id,
          name: workflowStates.name,
          type: workflowStates.type,
          color: workflowStates.color,
          position: workflowStates.position,
          description: workflowStates.description,
        })
        .from(workflowStates)
        .where(eq(workflowStates.projectId, values.projectId)),
      permalink(install, context),
      slackProfile(install, input.slackUserId),
    ]);
    if (!project) return;
    // Asks land in triage like Linear's; projects without triage use their default state.
    const triage = project.triageEnabled ? firstStateOfType(states, 'triage') : undefined;

    const who = profile.name ?? 'a Slack user';
    const footer = `---\n_Asked in Slack by ${who}${link ? ` · [View message](${link})` : ''}_`;
    const room = DESCRIPTION_MAX - footer.length - 2;
    const body = values.description.length > room ? `${values.description.slice(0, room - 1)}…` : values.description;
    const description = [body, footer].filter(Boolean).join('\n\n');

    const result = await createIssue(userId ? { userId } : SYSTEM_ACTOR, project.id, {
      title: values.title,
      description,
      priority: values.priority,
      ...(triage ? { stateId: triage.id } : {}),
    });
    if (!result.ok) {
      await tell(install, input.slackUserId, context, `Couldn't create the issue: ${result.error}`);
      return;
    }

    // Best effort: link the request to a customer by the requester's email domain.
    const customer = await matchCustomerByEmail(project.id, profile.email).catch(() => null);
    await db.insert(customerRequests).values({
      id: crypto.randomUUID(),
      projectId: project.id,
      ticketId: result.issue.id,
      customerId: customer?.id ?? null,
      source: 'slack',
      name: profile.name,
      email: profile.email,
      body: values.description || values.title,
      createdAt: new Date(),
    });

    const url = absoluteIssueUrl(project.id, result.issue.key);
    await tell(
      install,
      input.slackUserId,
      context,
      `Created <${url}|${result.issue.key} ${slackEscape(result.issue.title)}>${triage ? ' in triage' : ''}.`,
    );
  } catch (err) {
    console.error('[slack] submitAsk failed', err);
    await tell(install, input.slackUserId, input.context, 'Something went wrong creating the issue.').catch(() => {});
  }
}
