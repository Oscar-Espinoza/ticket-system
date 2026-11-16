<!--
  Workspace → Security → AI assistant connectors (docs/MCP.md, PLAN D8).
  Blocked: Claude, ChatGPT and other MCP clients can't see or change this
  workspace's teams; people's own projects outside the workspace are unaffected.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { setAiConnectorsAllowed } from '@/lib/actions/security';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';

  let { workspaceId, allowed: initialAllowed }: { workspaceId: string; allowed: boolean } = $props();

  let allowed = $state(untrack(() => initialAllowed));
  let pending = $state(false);

  async function toggle(next: boolean) {
    allowed = next;
    pending = true;
    try {
      const result = await setAiConnectorsAllowed({ workspaceId, allowed: next });
      if (result.ok) {
        toast.success(next ? m.settings_sec_ai_allowed_toast() : m.settings_sec_ai_blocked_toast());
      } else {
        allowed = !next;
        toast.error(result.error);
      }
    } finally {
      pending = false;
    }
  }
</script>

<div class="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3">
  <div>
    <Label for="ai-connectors" class="text-sm font-medium">
      {allowed ? m.settings_sec_ai_allowed_label() : m.settings_sec_ai_blocked_label()}
    </Label>
    <p class="mt-0.5 text-sm text-muted-foreground">
      {#if allowed}
        {m.settings_sec_ai_allowed_desc()}
      {:else}
        {m.settings_sec_ai_blocked_desc()}
      {/if}
    </p>
  </div>
  <Switch id="ai-connectors" bind:checked={() => allowed, toggle} disabled={pending} />
</div>
