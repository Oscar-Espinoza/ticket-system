// Sidebar "Workspaces" section (B9). Server component rendered by AppShell:
// each workspace links to its page, with its Initiatives (B8) indented below.
// With no workspace yet it still renders a single "Create a workspace" row —
// it's the feature's only entry point besides the palette.

import { Building2, Target } from 'lucide-react';

import { getUserWorkspaces } from '@/lib/workspace-access';
import { SidebarLink, SidebarSection } from '../sidebar-nav';
import { CreateWorkspaceTrigger } from '@/components/workspaces/create-workspace-dialog';

export interface SidebarWorkspacesProps {
  /** Session user id (already authenticated by the dashboard layout). */
  userId: string;
}

export async function SidebarWorkspaces({ userId }: SidebarWorkspacesProps) {
  const workspaces = await getUserWorkspaces(userId);

  if (workspaces.length === 0) {
    return (
      <SidebarSection title="Workspaces">
        <CreateWorkspaceTrigger variant="row" />
      </SidebarSection>
    );
  }

  return (
    <SidebarSection title="Workspaces" action={<CreateWorkspaceTrigger variant="icon" />}>
      {workspaces.map((workspace) => {
        const href = `/dashboard/workspaces/${workspace.slug}`;
        return (
          <div key={workspace.id} className="flex flex-col gap-px">
            <SidebarLink href={href} label={workspace.name} icon={<Building2 />} exact />
            <SidebarLink
              href={`${href}/initiatives`}
              label="Initiatives"
              icon={<Target />}
              indent
            />
          </div>
        );
      })}
    </SidebarSection>
  );
}

