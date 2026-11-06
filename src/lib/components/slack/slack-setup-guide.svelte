<!-- Slack app setup: request URLs and the app manifest. -->
<script lang="ts">
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import type { SlackAppUrls } from './slack-types';

  let { urls, manifest, open = false }: { urls: SlackAppUrls; manifest: string; open?: boolean } = $props();

  const rows = $derived([
    { label: 'OAuth redirect URL', value: urls.redirect },
    { label: 'Slash command /ask', value: urls.commands },
    { label: 'Interactivity & shortcuts', value: urls.interactivity },
    { label: 'Event subscriptions', value: urls.events },
  ]);
</script>

<details {open} class="group rounded-lg border px-4 py-3">
  <summary class="cursor-pointer text-sm font-medium select-none">
    {open ? 'Set up the Slack app' : 'App configuration'}
  </summary>
  <div class="mt-4 flex flex-col gap-5 text-sm">
    <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
      <li>
        Open
        <a
          href="https://api.slack.com/apps?new_app=1"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
        >
          api.slack.com/apps
          <ExternalLinkIcon class="size-3" />
        </a>
        → Create New App → <em>From a manifest</em>, pick a workspace and paste the JSON below.
      </li>
      <li>
        From <em>Basic Information</em>, copy the Client ID, Client Secret and Signing Secret into the
        server environment as <code class="font-mono text-xs">SLACK_CLIENT_ID</code>,
        <code class="font-mono text-xs">SLACK_CLIENT_SECRET</code> and
        <code class="font-mono text-xs">SLACK_SIGNING_SECRET</code>, then redeploy.
      </li>
      <li>Come back here and click “Add to Slack”. The free Slack plan is enough.</li>
    </ol>

    <div class="flex flex-col gap-2">
      <p class="font-medium">Request URLs</p>
      {#each rows as row (row.label)}
        <div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center">
          <span class="text-xs text-muted-foreground">{row.label}</span>
          <CopyField value={row.value} label="URL" />
        </div>
      {/each}
    </div>

    <div class="flex flex-col gap-2">
      <p class="font-medium">App manifest</p>
      <CopyField value={manifest} label="Manifest" multiline class="[&_textarea]:h-48" />
    </div>
  </div>
</details>
