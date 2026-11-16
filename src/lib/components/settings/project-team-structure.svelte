<script lang="ts">
  import { m } from '@/lib/i18n';
  import ProjectParentForm from './project-parent-form.svelte';
  import ProjectVisibilityForm from './project-visibility-form.svelte';
  import type { ProjectGeneralFormProps } from './project-general-types';

  let props: ProjectGeneralFormProps = $props();
</script>

<section class="flex flex-col gap-6">
  <div>
    <h2 class="text-base font-medium">{m.settings_project_team_structure()}</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      {#if props.workspaceName}
        {@const parts = m
          .settings_project_team_structure_desc({ workspace: '\u0000' })
          .split('\u0000')}
        {parts[0]}<span class="text-foreground">{props.workspaceName}</span>{parts[1]}
      {:else}
        {m.settings_project_team_structure_none()}
      {/if}
    </p>
  </div>
  <ProjectParentForm {...props} />
  <ProjectVisibilityForm {...props} />
</section>
