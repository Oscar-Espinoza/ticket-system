<!--
  Settings → GitLab, Bitbucket & Sentry body. Code hosts connect with an access
  token (encrypted server-side) and get a webhook; Sentry connects an internal
  integration by its client secret. Controls hide for non-admins; the actions
  re-check the role server-side.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import Callout from '@/lib/components/settings/callout.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import SentrySection from './sentry-section.svelte';
  import VcsSection from './vcs-section.svelte';
  import type { DeveloperSettingsProps } from './developer-types';

  let props: DeveloperSettingsProps = $props();
</script>

<div class="flex flex-col">
  {#if !props.canEdit}
    <p
      class="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
    >
      {m.settings_dev_owners_only()}
    </p>
  {/if}
  {#if props.webhookUnreachable}
    <div class="mb-6">
      <Callout tone="warning">
        {m.settings_dev_webhook_unreachable({ url: props.webhookBase })}
      </Callout>
    </div>
  {/if}
  <VcsSection
    provider="gitlab"
    projectId={props.projectId}
    canEdit={props.canEdit}
    integration={props.gitlab}
  />
  <Separator class="my-10" />
  <VcsSection
    provider="bitbucket"
    projectId={props.projectId}
    canEdit={props.canEdit}
    integration={props.bitbucket}
  />
  <Separator class="my-10" />
  <SentrySection
    projectId={props.projectId}
    canEdit={props.canEdit}
    sentry={props.sentry}
    sentryWebhookUrl={props.sentryWebhookUrl}
  />
</div>
