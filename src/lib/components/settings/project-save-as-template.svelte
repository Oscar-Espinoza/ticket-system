<script lang="ts">
  import LayoutTemplateIcon from '@lucide/svelte/icons/layout-template';

  import TemplateDialog from '@/lib/components/project-templates/template-dialog.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { ProjectGeneralFormProps } from './project-general-types';

  let { projectId, name, ticketKey, workspaceId, templateWorkspaces }: ProjectGeneralFormProps =
    $props();

  let open = $state(false);
</script>

<section class="flex flex-col gap-3">
  <div>
    <h2 class="text-base font-medium">Project template</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Reuse this project&rsquo;s workflow, labels, estimates, cycle and triage settings, SLAs and
      issue templates when creating new projects.
    </p>
  </div>
  <Button variant="outline" class="w-fit" onclick={() => (open = true)}>
    <LayoutTemplateIcon />
    Save as template…
  </Button>
  <TemplateDialog
    bind:open
    fixedProject={{ id: projectId, name, ticketKey }}
    workspaces={templateWorkspaces}
    defaultWorkspaceId={workspaceId}
  />
</section>
