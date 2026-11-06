<script lang="ts">
  import { Separator } from '@/lib/components/ui/separator';
  import ProjectDangerZone from './project-danger-zone.svelte';
  import ProjectDetailsForm from './project-details-form.svelte';
  import ProjectKeyForm from './project-key-form.svelte';
  import ProjectSaveAsTemplate from './project-save-as-template.svelte';
  import ProjectTeamStructure from './project-team-structure.svelte';
  import type { ProjectGeneralFormProps } from './project-general-types';

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
