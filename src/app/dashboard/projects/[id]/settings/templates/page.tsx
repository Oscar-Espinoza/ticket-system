import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { listTemplates } from '@/app/actions/templates';
import { TemplateSettings } from '@/components/productivity/template-settings';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Templates' };

export default async function TemplatesSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  const result = await listTemplates(id);
  if (!result.ok) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">Templates</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Starting points for new issues — a title, a description and default properties. Apply
        one from the new-issue dialog or the command palette.
      </p>
      <TemplateSettings
        projectId={id}
        templates={result.templates}
        canEdit={roleAllows(membership.role, 'write')}
      />
    </>
  );
}
