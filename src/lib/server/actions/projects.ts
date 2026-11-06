// createProject: the "new project" dialog's form action. The session decides
// the owner; the ticket key must match /^[A-Z]{2,6}$/ here (the client
// transform is UX only).

import { createProjectRecord, type CreateProjectErrors } from '@/lib/server/project-create';
import { formField, refreshesData } from '@/lib/server/action-kit';
import { getSession } from '@/lib/session';

export type CreateProjectState = {
  errors?: CreateProjectErrors & { server?: string };
  success?: boolean;
  projectId?: string;
};

export async function createProject(
  prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await getSession();
  if (!session?.user) {
    return { errors: { server: 'Not authenticated' } };
  }

  const created = await createProjectRecord({
    userId: session.user.id,
    name: formField(formData, 'name'),
    ticketKey: formField(formData, 'ticketKey'),
    templateId: formField(formData, 'templateId'),
  });
  if (!created.ok) return { errors: created.errors };

  refreshesData();
  return { success: true, projectId: created.projectId };
}
