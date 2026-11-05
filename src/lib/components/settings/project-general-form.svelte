<script module lang="ts">
  import type { ProjectVisibility } from '@/lib/actions/project-settings';
  import type { TemplateWorkspaceOption } from '@/lib/components/project-templates/template-dialog.svelte';

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
</script>

<script lang="ts">
  import { Separator } from '@/lib/components/ui/separator';
  import ProjectDangerZone from './project-danger-zone.svelte';
  import ProjectDetailsForm from './project-details-form.svelte';
  import ProjectKeyForm from './project-key-form.svelte';
  import ProjectSaveAsTemplate from './project-save-as-template.svelte';
  import ProjectTeamStructure from './project-team-structure.svelte';

  let props: ProjectGeneralFormProps = $props();
</script>

<div class="flex flex-col">
  {#if !props.canEdit}
    <p
      class="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
    >
      Only project owners and admins can change these settings.
    </p>
  {/if}
  <ProjectDetailsForm {...props} />
  <Separator class="my-10" />
  <ProjectTeamStructure {...props} />
  <Separator class="my-10" />
  <ProjectKeyForm {...props} />
  {#if props.canEdit}
    <Separator class="my-10" />
    <ProjectSaveAsTemplate {...props} />
  {/if}
  {#if props.isOwner}
    <Separator class="my-10" />
    <ProjectDangerZone projectId={props.projectId} name={props.name} />
  {/if}
</div>
