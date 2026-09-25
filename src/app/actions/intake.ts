'use server';

// Intake form: admin settings (enable / rotate the public token) and the public
// submission action. The submission is unauthenticated — the token IS the
// credential — so it only ever reveals the project name, silently drops likely
// spam (honeypot, too-fast submits) and caps the rate per project.

import { revalidatePath } from 'next/cache';
import { and, count, eq, gte } from 'drizzle-orm';

import { db } from '@/lib/db';
import { customerRequests, projects, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { createIssue, SYSTEM_ACTOR } from '@/lib/issue-service';
import { stripMentions } from '@/lib/mentions';
import { defaultNewIssueState, firstStateOfType } from '@/lib/workflow';
import { appUrl } from '@/lib/integrations/app-url';
import { checkFormStamp, generateIntakeToken } from '@/lib/integrations/intake';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;
const NAME_MAX = 100;
const EMAIL_MAX = 200;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const intakeUrl = (token: string) => `${appUrl()}/request/${token}`;

async function setToken(projectId: string, token: string | null): Promise<Result<{ url: string | null }>> {
  const gate = await authorizeProjectAction(projectId, 'admin');
  if (!gate.ok) return { ok: false, error: gate.error };
  await db
    .update(projects)
    .set({ intakeToken: token, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidatePath(`/dashboard/projects/${projectId}/settings/intake`);
  return { ok: true, url: token ? intakeUrl(token) : null };
}

export async function setIntakeEnabled(input: {
  projectId: string;
  enabled: boolean;
}): Promise<Result<{ url: string | null }>> {
  return setToken(input?.projectId, input?.enabled ? generateIntakeToken() : null);
}

/** New public link; the old one (and any embeds of it) stops working. */
export async function rotateIntakeToken(input: {
  projectId: string;
}): Promise<Result<{ url: string | null }>> {
  return setToken(input?.projectId, generateIntakeToken());
}

// ---------------------------------------------------------------------------
// Public submission
// ---------------------------------------------------------------------------

export type IntakeField = 'name' | 'email' | 'title' | 'description';

export interface IntakeFormState {
  status?: 'success';
  errors?: Partial<Record<IntakeField | 'server', string>>;
  values?: Partial<Record<IntakeField, string>>;
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

// Users can't @mention from outside: flatten mention tokens to plain text.
const clean = (value: string) => stripMentions(value);

export async function submitIntakeRequest(
  _prev: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const values = {
    name: clean(text(formData, 'name')),
    email: text(formData, 'email'),
    title: clean(text(formData, 'title')),
    description: clean(text(formData, 'description')),
  };
  const token = text(formData, 'token');

  // Spam gets a normal-looking success so bots learn nothing.
  const stamp = checkFormStamp(formData.get('stamp'));
  if (text(formData, 'website') || stamp === 'too-fast' || stamp === 'invalid') {
    return { status: 'success' };
  }
  if (stamp === 'expired') {
    return { values, errors: { server: 'This page was open too long. Reload it and try again.' } };
  }

  const errors: IntakeFormState['errors'] = {};
  if (values.name.length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  if (!values.email) errors.email = 'Email is required so the team can follow up.';
  else if (values.email.length > EMAIL_MAX || !EMAIL_RE.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.title) errors.title = 'Give your request a short summary.';
  else if (values.title.length > TITLE_MAX) {
    errors.title = `Summary must be ${TITLE_MAX} characters or fewer.`;
  }
  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = `Details must be ${DESCRIPTION_MAX.toLocaleString('en')} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0) return { values, errors };

  const unavailable: IntakeFormState = {
    values,
    errors: { server: 'This form is no longer accepting requests.' },
  };
  if (!token) return unavailable;

  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [[project], [recent]] = await Promise.all([
    db
      .select({ id: projects.id, triageEnabled: projects.triageEnabled })
      .from(projects)
      .where(eq(projects.intakeToken, token))
      .limit(1),
    db
      .select({ total: count() })
      .from(customerRequests)
      .innerJoin(projects, eq(customerRequests.projectId, projects.id))
      .where(and(eq(projects.intakeToken, token), gte(customerRequests.createdAt, since))),
  ]);
  if (!project) return unavailable;
  if (recent.total >= RATE_MAX) {
    return {
      values,
      errors: { server: 'This form is receiving a lot of requests. Try again in a few minutes.' },
    };
  }

  const states = await db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      position: workflowStates.position,
      description: workflowStates.description,
    })
    .from(workflowStates)
    .where(eq(workflowStates.projectId, project.id));
  const state =
    (project.triageEnabled ? firstStateOfType(states, 'triage') : undefined) ??
    defaultNewIssueState(states);

  const who = values.name ? `${values.name} (${values.email})` : values.email;
  const description = [values.description, `---\n_Submitted through the intake form by ${who}._`]
    .filter(Boolean)
    .join('\n\n');

  const result = await createIssue(SYSTEM_ACTOR, project.id, {
    title: values.title,
    description,
    ...(state ? { stateId: state.id } : {}),
  });
  if (!result.ok) {
    console.error('[intake] createIssue failed', result.error);
    return { values, errors: { server: 'Something went wrong. Please try again.' } };
  }

  await db.insert(customerRequests).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    ticketId: result.issue.id,
    name: values.name || null,
    email: values.email,
    body: values.description || values.title,
    createdAt: new Date(),
  });

  return { status: 'success' };
}
