<script lang="ts">
  import ProjectParentForm from './project-parent-form.svelte';
  import ProjectVisibilityForm from './project-visibility-form.svelte';
  import type { ProjectGeneralFormProps } from './project-general-types';

  let props: ProjectGeneralFormProps = $props();
</script>

<section class="flex flex-col gap-6">
  <div>
    <h2 class="text-base font-medium">Team structure</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      {#if props.workspaceName}
        Where this team sits in <span class="text-foreground">{props.workspaceName}</span> and who can
        find it.
      {:else}
        Parent teams and visibility apply once the project is in a workspace.
      {/if}
    </p>
  </div>
  <ProjectParentForm {...props} />
  <ProjectVisibilityForm {...props} />
</section>
