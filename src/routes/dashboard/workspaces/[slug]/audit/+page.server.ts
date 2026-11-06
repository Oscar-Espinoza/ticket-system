// Workspace → Audit log:
// workspace security events (SSO, SCIM, members' 2FA) plus the activity of every
// team in the workspace the viewer administers — workspace roles never grant
// access to a team's data on their own. Owners and admins only; non-members 404.

import { error } from '@sveltejs/kit';

import { resolveAuditScope } from '@/lib/audit';
import { loadAuditLogView } from '@/lib/components/audit/audit-log-view.server';
import { requireUser } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const user = await requireUser();
  const membership = await getWorkspaceMembership(params.slug, user.id);
  if (!membership) error(404, 'Workspace not found');

  const scope = await resolveAuditScope('workspace', membership.workspaceId, user.id);
  const teamCount = scope?.kind === 'workspace' ? scope.adminProjectIds.length : 0;

  return {
    workspace: { name: membership.name, slug: membership.slug },
    teamCount,
    admin: scope !== null,
    audit: scope
      ? await loadAuditLogView(scope, url.searchParams, `/dashboard/workspaces/${membership.slug}/audit`)
      : null,
  };
};
