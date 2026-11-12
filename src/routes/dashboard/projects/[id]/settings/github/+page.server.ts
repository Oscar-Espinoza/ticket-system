// Settings → GitHub: connect the viewer's GitHub account (elevated scopes),
// pick the project's repository, webhook status and PR automations.
// Membership is checked here; every action re-checks the admin role.

import { error } from '@sveltejs/kit';

import { getGithubAccount, githubMessage, type GithubAccountStatus } from '@/lib/github/client';
import { githubOAuthConfigured } from '@/lib/github/oauth-config';
import { webhookUrl } from '@/lib/github/webhooks';
import { getGithubSettings } from '@/lib/project-settings-read';
import { isUnreachableUrl } from '@/lib/vcs/webhook-url';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

// Better Auth redirects back with ?error=<code> when linking fails.
const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user:
    'That GitHub account is already linked to another user here.',
  unable_to_link_account: "GitHub didn't confirm your email address, so the account wasn't linked.",
  access_denied: 'GitHub access was not granted.',
};

export const load: PageServerLoad = async ({ params, url }) => {
  const { id } = params;
  const { user, project: membership } = await loadViewerProject(id);

  const [project, account] = await Promise.all([
    getGithubSettings(id),
    getGithubAccount(user.id).catch((err): GithubAccountStatus | { status: 'error' } => {
      console.error('[github] account lookup failed', githubMessage(err));
      return { status: 'error' };
    }),
  ]);
  if (!project) error(404, 'Not found');

  const target = webhookUrl();
  const errorCode = url.searchParams.get('error');

  return {
    projectId: id,
    canEdit: roleAllows(membership.role, 'admin'),
    account,
    oauthConfigured: githubOAuthConfigured(),
    linkError: errorCode
      ? (LINK_ERRORS[errorCode] ?? `GitHub linking failed (${errorCode}).`)
      : null,
    repo: project.repo,
    webhookRegistered: !!project.webhookId,
    connectedByName: project.connectedByName,
    webhookUrl: target,
    webhookUnreachable: isUnreachableUrl(target),
    prOpenStateId: project.prOpenStateId,
    prMergeStateId: project.prMergeStateId,
  };
};
