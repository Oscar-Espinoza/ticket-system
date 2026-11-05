<!-- The viewer's own link to one Slack workspace: DM toggle, unlink (LinkRow in slack-app-settings.tsx). -->
<script lang="ts">
  import { toast } from 'svelte-sonner';

  import { setSlackDmNotify, unlinkSlack } from '@/lib/actions/settings-slack';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import type { SlackWorkspace } from './slack-app-settings.svelte';

  let { workspace }: { workspace: SlackWorkspace } = $props();

  // svelte-ignore state_referenced_locally
  let notify = $state(workspace.link?.notify ?? true);
  let pending = $state(false);
  const switchId = $derived(`slack-dm-${workspace.teamId}`);

  async function toggle(next: boolean) {
    notify = next;
    pending = true;
    try {
      const result = await setSlackDmNotify({ teamId: workspace.teamId, notify: next });
      if (result && !result.ok) {
        notify = !next;
        toast.error(result.error);
      }
    } finally {
      pending = false;
    }
  }

  async function unlink() {
    pending = true;
    try {
      const result = await unlinkSlack({ teamId: workspace.teamId });
      if (!result) return;
      if (result.ok) toast.success(`Unlinked from ${workspace.teamName}`);
      else toast.error(result.error);
    } finally {
      pending = false;
    }
  }
</script>

<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
  <p class="min-w-0 flex-1 truncate text-sm font-medium">{workspace.teamName}</p>
  <div class="flex items-center gap-2">
    <Switch id={switchId} size="sm" bind:checked={() => notify, (next) => toggle(next)} disabled={pending} />
    <Label for={switchId} class="font-normal">Send me notifications as DMs</Label>
  </div>
  <Button size="sm" variant="ghost" class="text-muted-foreground" onclick={unlink} disabled={pending}>
    Unlink
  </Button>
</li>
