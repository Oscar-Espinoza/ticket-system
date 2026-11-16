<!-- Slack app setup: request URLs and the app manifest. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import RichText from '@/lib/components/settings/rich-text.svelte';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import type { SlackAppUrls } from './slack-types';

  let { urls, manifest, open = false }: { urls: SlackAppUrls; manifest: string; open?: boolean } = $props();

  const rows = $derived([
    { label: m.settings_slack_row_redirect(), value: urls.redirect },
    { label: m.settings_slack_row_command(), value: urls.commands },
    { label: m.settings_slack_row_interactivity(), value: urls.interactivity },
    { label: m.settings_slack_row_events(), value: urls.events },
  ]);
  const step1 = $derived(m.settings_slack_step1({ link: '\u0000' }).split('\u0000'));
</script>

<details {open} class="group rounded-lg border px-4 py-3">
  <summary class="cursor-pointer text-sm font-medium select-none">
    {open ? m.settings_slack_setup_title() : m.settings_slack_app_config()}
  </summary>
  <div class="mt-4 flex flex-col gap-5 text-sm">
    <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
      <li>
        {step1[0]}<a
          href="https://api.slack.com/apps?new_app=1"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
        >
          api.slack.com/apps <!-- i18n-ignore -->
          <ExternalLinkIcon class="size-3" />
        </a><RichText text={step1[1]} />
      </li>
      <li>
        <RichText text={m.settings_slack_step2()} />
      </li>
      <li>{m.settings_slack_step3()}</li>
    </ol>

    <div class="flex flex-col gap-2">
      <p class="font-medium">{m.settings_slack_request_urls()}</p>
      {#each rows as row (row.label)}
        <div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center">
          <span class="text-xs text-muted-foreground">{row.label}</span>
          <CopyField value={row.value} label={m.settings_slack_url()} />
        </div>
      {/each}
    </div>

    <div class="flex flex-col gap-2">
      <p class="font-medium">{m.settings_slack_app_manifest()}</p>
      <CopyField value={manifest} label={m.settings_slack_manifest()} multiline class="[&_textarea]:h-48" />
    </div>
  </div>
</details>
