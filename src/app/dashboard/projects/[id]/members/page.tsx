// Members moved under project settings; keep old links working.

import { redirect } from 'next/navigation';

import { projectHref } from '@/components/app-shell/routes';

export default async function MembersRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(projectHref(id, 'settings/members'));
}
