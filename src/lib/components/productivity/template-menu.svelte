<!-- "Template" dropdown in the new-issue dialog header. -->
<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text';
  import Settings2 from '@lucide/svelte/icons/settings-2';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { projectHref } from '@/lib/components/app-shell/routes';
  import { useTemplates, type IssueTemplate } from './templates-store.svelte';

  let {
    enabled,
    onApply,
  }: {
    /** Load the templates (the dialog is open). */
    enabled: boolean;
    onApply: (template: IssueTemplate) => void;
  } = $props();

  const data = useProjectData();
  const templates = useTemplates(
    () => data.project.id,
    () => enabled,
  );
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button {...props} type="button" variant="ghost" size="xs" class="text-muted-foreground">
        <FileText />
        Template
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" class="w-56">
    <DropdownMenuLabel>Apply template</DropdownMenuLabel>
    {#if templates.current === undefined}
      <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
    {:else if templates.current.length === 0}
      <DropdownMenuItem disabled>No templates yet</DropdownMenuItem>
    {:else}
      {#each templates.current as template (template.id)}
        <DropdownMenuItem onSelect={() => onApply(template)}>
          <FileText />
          <span class="truncate">{template.name}</span>
        </DropdownMenuItem>
      {/each}
    {/if}
    <DropdownMenuSeparator />
    <DropdownMenuItem>
      {#snippet child({ props })}
        <a {...props} href={projectHref(data.project.id, 'settings/templates')}>
          <Settings2 />
          Manage templates
        </a>
      {/snippet}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
