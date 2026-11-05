// Project settings › Audit log: every recorded event for this team (issue and
// comment activity, member / role / settings changes) plus its workspace's
// security events. Owners and admins only; non-members 404.

import { error, redirect } from '@sveltejs/kit';

import { projectHref } from '@/components/app-shell/routes';
import { resolveAuditScope } from '@/lib/audit';
import { loadAuditLogView } from '@/lib/components/audit/audit-log-view.server';
import { getMemberProject } from '@/lib/project-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const project = await getMemberProject(id, locals.user.id);
  if (!project) error(404, 'Not found');

  const scope = await resolveAuditScope('project', id, locals.user.id);

  return {
    projectName: project.name,
    // null = not an owner / admin: the page shows the "Admins only" state.
    audit: scope
      ? await loadAuditLogView(scope, url.searchParams, projectHref(id, 'settings/audit'))
      : null,
  };
};
