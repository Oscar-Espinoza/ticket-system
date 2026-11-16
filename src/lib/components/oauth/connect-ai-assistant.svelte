<!--
  Settings → OAuth apps → Connect an AI assistant (docs/MCP.md): the MCP URL
  to paste, and the short steps for Claude, ChatGPT and Claude Code. The
  connections then show up under Authorized apps below, where they can be
  revoked.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import Field from '@/lib/components/settings/field.svelte';

  let { mcpUrl }: { mcpUrl: string } = $props();

  const runParts = $derived(m.settings_oauth_cc_run({ command: '\u0000' }).split('\u0000'));
  const browserParts = $derived(m.settings_oauth_no_browser({ header: '\u0000' }).split('\u0000'));
  const claudeCode = $derived(`claude mcp add --transport http ticket-system ${mcpUrl}`);
</script>

<section class="flex flex-col gap-4" aria-labelledby="connect-ai-heading">
  <div>
    <h2 id="connect-ai-heading" class="text-base font-medium">{m.settings_oauth_connect_ai()}</h2>
    <p class="mt-0.5 text-sm text-muted-foreground">
      {m.settings_oauth_connect_ai_desc()}
    </p>
  </div>

  <Field id="mcp-url" label={m.settings_oauth_mcp_url()}>
    <CopyField id="mcp-url" value={mcpUrl} label={m.settings_oauth_mcp_url_short()} />
  </Field>

  <div class="grid gap-3 text-sm sm:grid-cols-3">
    <div class="rounded-lg border border-border px-4 py-3">
      <h3 class="font-medium">Claude</h3> <!-- i18n-ignore -->
      <ol class="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
        <li>{m.settings_oauth_claude_1()}</li>
        <li>{m.settings_oauth_claude_2()}</li>
        <li>{m.settings_oauth_claude_3()}</li>
      </ol>
    </div>
    <div class="rounded-lg border border-border px-4 py-3">
      <h3 class="font-medium">ChatGPT</h3> <!-- i18n-ignore -->
      <ol class="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
        <li>{m.settings_oauth_chatgpt_1()}</li>
        <li>{m.settings_oauth_chatgpt_2()}</li>
        <li>{m.settings_oauth_chatgpt_3()}</li>
      </ol>
    </div>
    <div class="rounded-lg border border-border px-4 py-3">
      <h3 class="font-medium">Claude Code</h3> <!-- i18n-ignore -->
      <p class="mt-1 text-muted-foreground">
        {runParts[0]}<code class="font-mono text-xs">/mcp</code>{runParts[1]} <!-- i18n-ignore -->
      </p>
    </div>
  </div>
  <Field id="mcp-claude-code" label={m.settings_oauth_cc_command()}>
    <CopyField id="mcp-claude-code" value={claudeCode} label={m.settings_oauth_command()} />
  </Field>
  <p class="text-xs text-muted-foreground">
    {browserParts[0]}<code class="font-mono">--header "Authorization: Bearer lc_…"</code>{browserParts[1]} <!-- i18n-ignore -->
  </p>
</section>
