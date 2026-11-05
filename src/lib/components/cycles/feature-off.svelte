<!-- Empty state for a planning feature that is turned off in project settings. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';

  let {
    projectId,
    icon,
    title,
    description,
    canEnable,
  }: {
    projectId: string;
    icon: Snippet;
    title: string;
    description: string;
    /** Admins get the settings link; everyone else is told who can. */
    canEnable: boolean;
  } = $props();
</script>

{#snippet enableAction()}
  <Button size="sm" variant="outline" href={projectHref(projectId, 'settings/planning')}>
    Enable in settings
  </Button>
{/snippet}

<EmptyState
  {icon}
  {title}
  description={canEnable ? description : `${description} Ask a project admin to turn it on.`}
  action={canEnable ? enableAction : undefined}
/>
