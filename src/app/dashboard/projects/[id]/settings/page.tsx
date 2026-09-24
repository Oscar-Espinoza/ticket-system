import { redirect } from 'next/navigation';

import { projectHref } from '@/components/app-shell/routes';

export default async function ProjectSettingsIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(projectHref(id, 'settings/general'));
}
