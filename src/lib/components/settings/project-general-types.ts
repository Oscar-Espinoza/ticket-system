import type { ProjectVisibility } from '@/lib/actions/project-settings';
import type { TemplateWorkspaceOption } from '@/lib/components/project-templates/template-types';

export interface ProjectGeneralFormProps {
  projectId: string;
  name: string;
  ticketKey: string;
  description: string;
  estimateScale: string;
  /** Owner or admin: may edit details. */
  canEdit: boolean;
  /** Owner only: may change the key and delete the project. */
  isOwner: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  /** Current parent team (only when it's one of `parentOptions`). */
  parentId: string | null;
  /** Teams this one may be nested under (same workspace, viewer is a member). */
  parentOptions: { id: string; name: string; ticketKey: string }[];
  visibility: ProjectVisibility;
  /** Workspaces a template saved from here can be shared with. */
  templateWorkspaces: TemplateWorkspaceOption[];
}
