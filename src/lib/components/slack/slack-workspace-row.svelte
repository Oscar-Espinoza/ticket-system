<!-- One installed Slack workspace: where unlinked Asks land, uninstall. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { setSlackDefaultProject, uninstallSlack } from '@/lib/actions/settings-slack';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import type { SlackAdminProject, SlackWorkspace } from './slack-types';

  const NONE = '__none';
  const noneLabel = $derived(m.settings_slack_nowhere_linked());

  let { workspace, adminProjects }: { workspace: SlackWorkspace; adminProjects: SlackAdminProject[] } = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(workspace.defaultProject?.id ?? NONE);
  let confirming = $state(false);
  let saving = $state(false);
  let removing = $state(false);

  // Keep the current default selectable even when the viewer doesn't admin it.
  const options = $derived.by((): (SlackAdminProject & { disabled?: boolean })[] => {
    const current = workspace.defaultProject;
    return current && !adminProjects.some((p) => p.id === current.id)
      ? [{ ...current, ticketKey: '', disabled: true }, ...adminProjects]
      : adminProjects;
  });
  const items = $derived([
    { value: NONE, label: noneLabel },
    ...options.map((p) => ({ value: p.id, label: p.name, disabled: p.disabled })),
  ]);

  async function change(next: string) {
    const previous = value;
    value = next;
    saving = true;
    try {
      const result = await setSlackDefaultProject({
        teamId: workspace.teamId,
        projectId: next === NONE ? null : next,
      });
      if (!result) return;
      if (result.ok) toast.success(
          next === NONE ? m.settings_slack_asks_linked_only_toast() : m.settings_slack_default_updated_toast(),
        );
      else {
        value = previous;
        toast.error(result.error);
      }
    } finally {
      saving = false;
    }
  }

  async function uninstall() {
    removing = true;
    try {
      const result = await uninstallSlack({ teamId: workspace.teamId });
      if (!result) return;
      if (result.ok) toast.success(m.settings_slack_removed_toast({ name: workspace.teamName }));
      else toast.error(result.error);
    } finally {
      removing = false;
    }
  }

  const selectId = $derived(`slack-default-${workspace.teamId}`);
</script>

<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium">{workspace.teamName}</p>
    <p class="truncate text-xs text-muted-foreground">
      {workspace.installedByName
        ? m.settings_slack_installed_by({ name: workspace.installedByName })
        : m.settings_slack_installed()}
    </p>
  </div>
  <div class="flex items-center gap-2">
    {#if workspace.canManage}
      <Label for={selectId} class="text-xs font-normal text-muted-foreground">{m.settings_slack_unlinked_go_to()}</Label>
    {:else}
      <span class="text-xs text-muted-foreground">{m.settings_slack_unlinked_go_to()}</span>
    {/if}
    {#if workspace.canManage}
      <Select {items} bind:value={() => value, (next) => change(next)} disabled={saving}>
        <SelectTrigger id={selectId} size="sm" class="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {#each options as project (project.id)}
            <SelectItem value={project.id} disabled={project.disabled ?? false}>{project.name}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
    {:else}
      <span class="text-sm">{workspace.defaultProject?.name ?? m.settings_slack_nowhere()}</span>
    {/if}
  </div>
  {#if workspace.canManage}
    <Button
      size="sm"
      variant="ghost"
      class="text-muted-foreground"
      onclick={() => (confirming = true)}
      disabled={removing}
    >
      {#if removing}<LoaderCircleIcon class="animate-spin" />{/if}
      {m.settings_slack_uninstall()}
    </Button>
  {/if}

  <AlertDialog bind:open={confirming}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>{m.settings_slack_uninstall_title({ name: workspace.teamName })}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.settings_slack_uninstall_desc()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onclick={uninstall}>{m.settings_slack_uninstall()}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</li>
