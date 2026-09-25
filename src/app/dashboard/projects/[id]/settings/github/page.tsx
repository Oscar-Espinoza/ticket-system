// Settings → GitHub: connect the viewer's GitHub account (elevated scopes),
// pick the project's repository, webhook status and PR automations.
// Membership is checked here; every action re-checks the admin role.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { GithubSettings } from '@/components/github/github-settings';
import { projects, users } from '@/db/schema';
import { db } from '@/lib/db';
import { getGithubAccount, githubMessage, type GithubAccountStatus } from '@/lib/github/client';
import { isUnreachableUrl, webhookUrl } from '@/lib/github/webhooks';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'GitHub' };

// Better Auth redirects back with ?error=<code> when linking fails.
const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user:
    'That GitHub account is already linked to another user here.',
  unable_to_link_account: "GitHub didn't confirm your email address, so the account wasn't linked.",
  access_denied: 'GitHub access was not granted.',
};

export default async function GithubSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const [{ id }, { error }, session] = await Promise.all([params, searchParams, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  const [[project], account] = await Promise.all([
    db
      .select({
        repo: projects.githubRepo,
        webhookId: projects.githubWebhookId,
        prOpenStateId: projects.githubPrOpenStateId,
        prMergeStateId: projects.githubPrMergeStateId,
        connectedByName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.githubConnectedById))
      .where(eq(projects.id, id))
      .limit(1),
    getGithubAccount(session.user.id).catch((err): GithubAccountStatus | { status: 'error' } => {
      console.error('[github] account lookup failed', githubMessage(err));
      return { status: 'error' };
    }),
  ]);
  if (!project) notFound();

  const target = webhookUrl();
  const errorCode = Array.isArray(error) ? error[0] : error;

  return (
    <>
      <h1 className="text-xl font-medium">GitHub</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Link a repository to create branches from issues and move issues as pull requests
        are opened and merged.
      </p>
      <GithubSettings
        projectId={id}
        canEdit={roleAllows(membership.role, 'admin')}
        account={account}
        linkError={errorCode ? (LINK_ERRORS[errorCode] ?? `GitHub linking failed (${errorCode}).`) : null}
        repo={project.repo}
        webhookRegistered={!!project.webhookId}
        connectedByName={project.connectedByName}
        webhookUrl={target}
        webhookUnreachable={isUnreachableUrl(target)}
        prOpenStateId={project.prOpenStateId}
        prMergeStateId={project.prMergeStateId}
      />
    </>
  );
}
