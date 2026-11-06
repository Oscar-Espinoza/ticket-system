<script lang="ts">
  import Building2Icon from '@lucide/svelte/icons/building-2';
  import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import TargetIcon from '@lucide/svelte/icons/target';

  import { WORKSPACE_ROLE_LABEL } from '@/lib/workspace-types';
  import { Button } from '@/lib/components/ui/button';
  import { LabelChip } from '@/lib/components/ui-icons';
  import WorkspaceActions from '@/lib/components/workspaces/workspace-actions.svelte';
  import WorkspaceMembers from '@/lib/components/workspaces/workspace-members.svelte';
  import WorkspaceProjects from '@/lib/components/workspaces/workspace-projects.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const membership = $derived(data.membership);
  const isAdmin = $derived(membership.role !== 'member');
</script>

<svelte:head>
  <title>{membership.name} · Ticket System</title>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-10">
  <header class="flex items-start gap-3">
    <span
      aria-hidden="true"
      class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
    >
      <Building2Icon class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-xl font-medium">{membership.name}</h1>
      <p class="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
        <span class="font-mono text-xs">/{membership.slug}</span>
        <LabelChip color={membership.role === 'owner' ? 'primary' : 'default'}>
          {WORKSPACE_ROLE_LABEL[membership.role]}
        </LabelChip>
      </p>
    </div>
    <Button variant="outline" size="sm" href="/dashboard/workspaces/{membership.slug}/initiatives">
      <TargetIcon />
      Initiatives
    </Button>
    {#if isAdmin}
      <Button variant="outline" size="sm" href="/dashboard/workspaces/{membership.slug}/security">
        <ShieldCheckIcon />
        Security
      </Button>
      <Button variant="outline" size="sm" href="/dashboard/workspaces/{membership.slug}/audit">
        <ScrollTextIcon />
        Audit log
      </Button>
    {/if}
    <WorkspaceActions workspace={{ id: membership.workspaceId, name: membership.name }} role={membership.role} />
  </header>

  <WorkspaceProjects
    workspaceId={membership.workspaceId}
    projects={data.projects}
    eligible={data.eligible}
    role={membership.role}
  />

  <WorkspaceMembers
    workspaceId={membership.workspaceId}
    members={data.members}
    invitations={data.invitations}
    viewerId={data.viewerId}
    role={membership.role}
  />
</div>
