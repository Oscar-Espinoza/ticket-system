<!--
  Create ("Save as template") / edit dialog for project templates. Creating
  snapshots the chosen project's setup on the server at save time.
-->
<script module lang="ts">
  export interface TemplateSourceProject {
    id: string;
    name: string;
    ticketKey: string;
  }

  export interface TemplateWorkspaceOption {
    id: string;
    name: string;
  }
</script>

<script lang="ts">
  import type { ProjectTemplateRow } from '@/lib/actions/project-templates';
  import {
    Dialog,
    DialogContent,
  } from '@/lib/components/ui/dialog';
  import TemplateForm from './template-form.svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    template,
    projects,
    fixedProject,
    workspaces,
    defaultWorkspaceId,
    onSaved,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Edit this template; omit to create one. */
    template?: ProjectTemplateRow;
    /** Projects the viewer administers (create mode, picker). */
    projects?: TemplateSourceProject[];
    /** Create from this project (no picker). */
    fixedProject?: TemplateSourceProject;
    workspaces: TemplateWorkspaceOption[];
    defaultWorkspaceId?: string | null;
    onSaved?: (template: ProjectTemplateRow | undefined) => void;
  } = $props();

  function setOpen(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }
</script>

<Dialog {open} onOpenChange={setOpen}>
  <DialogContent class="sm:max-w-md">
    <!-- Remount per open so the fields start from the current values. -->
    {#if open}
      <TemplateForm
        {template}
        {projects}
        {fixedProject}
        {workspaces}
        {defaultWorkspaceId}
        onDone={(saved) => {
          setOpen(false);
          onSaved?.(saved);
        }}
        onCancel={() => setOpen(false)}
      />
    {/if}
  </DialogContent>
</Dialog>
