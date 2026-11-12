<!--
  Settings → OAuth apps → Connect an AI assistant (docs/MCP.md): the MCP URL
  to paste, and the short steps for Claude, ChatGPT and Claude Code. The
  connections then show up under Authorized apps below, where they can be
  revoked.
-->
<script lang="ts">
  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import Field from '@/lib/components/settings/field.svelte';

  let { mcpUrl }: { mcpUrl: string } = $props();

  const claudeCode = $derived(`claude mcp add --transport http ticket-system ${mcpUrl}`);
</script>

<section class="flex flex-col gap-4" aria-labelledby="connect-ai-heading">
  <div>
    <h2 id="connect-ai-heading" class="text-base font-medium">Connect an AI assistant</h2>
    <p class="mt-0.5 text-sm text-muted-foreground">
      Let Claude, ChatGPT or another MCP client read your issues and, with your permission, create
      issues, update them and comment as you. Workspace admins can block this per workspace.
    </p>
  </div>

  <Field id="mcp-url" label="MCP server URL">
    <CopyField id="mcp-url" value={mcpUrl} label="MCP URL" />
  </Field>

  <div class="grid gap-3 text-sm sm:grid-cols-3">
    <div class="rounded-lg border border-border px-4 py-3">
      <h3 class="font-medium">Claude</h3>
      <ol class="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
        <li>Settings → Connectors → Add custom connector.</li>
        <li>Paste the URL above and add it.</li>
        <li>Click Connect, sign in here and allow access.</li>
      </ol>
    </div>
    <div class="rounded-lg border border-border px-4 py-3">
      <h3 class="font-medium">ChatGPT</h3>
      <ol class="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
        <li>Open chatgpt.com/plugins → + → Add custom MCP server.</li>
        <li>Paste the URL above and choose OAuth.</li>
        <li>Sign in here and allow access.</li>
      </ol>
    </div>
    <div class="rounded-lg border border-border px-4 py-3">
      <h3 class="font-medium">Claude Code</h3>
      <p class="mt-1 text-muted-foreground">
        Run this, then <code class="font-mono text-xs">/mcp</code> in Claude Code to sign in:
      </p>
    </div>
  </div>
  <Field id="mcp-claude-code" label="Claude Code command">
    <CopyField id="mcp-claude-code" value={claudeCode} label="Command" />
  </Field>
  <p class="text-xs text-muted-foreground">
    For agents without a browser, use a personal API key (Settings → API keys):
    <code class="font-mono">--header "Authorization: Bearer lc_…"</code>. Revoke an assistant’s access
    anytime under Authorized apps below.
  </p>
</section>
