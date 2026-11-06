<script lang="ts">
  import { toast } from 'svelte-sonner';

  import { disconnectIntegration } from '@/lib/actions/developer';
  import Field from '@/lib/components/settings/field.svelte';
  import SectionHeading from '@/lib/components/settings/section-heading.svelte';
  import { Button } from '@/lib/components/ui/button';
  import CopyField from './copy-field.svelte';
  import type { SentryIntegrationView } from './developer-types';
  import DisconnectButton from './disconnect-button.svelte';
  import SentryForm from './sentry-form.svelte';
  import SentryMark from './sentry-mark.svelte';

  let {
    projectId,
    canEdit,
    sentry,
    sentryWebhookUrl,
  }: {
    projectId: string;
    canEdit: boolean;
    sentry: SentryIntegrationView | null;
    sentryWebhookUrl: string;
  } = $props();

  let editing = $state(false);
  let pending = $state(false);
  const webhookUrl = $derived(sentry?.webhookUrl ?? sentryWebhookUrl);

  async function disconnect() {
    pending = true;
    try {
      const result = await disconnectIntegration({ projectId, provider: 'sentry' });
      if (!result.ok) toast.error(result.error);
      else toast.success('Sentry disconnected');
    } finally {
      pending = false;
    }
  }
</script>

<section class="flex flex-col gap-4" aria-label="Sentry">
  <SectionHeading
    title="Sentry"
    description="Turn Sentry issue alerts into triage issues — one per Sentry issue, with the culprit, event count and a link — and note on the issue when Sentry marks it resolved. To link an existing Sentry issue, paste its URL as a link on the issue."
  >
    {#snippet icon()}<SentryMark class="size-4 text-[#7553ff]" />{/snippet}
  </SectionHeading>

  {#if sentry && !editing}
    <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div class="flex items-center gap-2 text-sm">
        <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
        Connected
        <span class="text-muted-foreground">
          · {sentry.hasToken ? 'event counts on' : 'no auth token (no event counts)'}
        </span>
        {#if sentry.connectedByName}
          <span class="ml-auto text-xs text-muted-foreground">
            Connected by {sentry.connectedByName}
          </span>
        {/if}
      </div>
      <Field id="sentry-url" label="Webhook URL">
        <CopyField value={webhookUrl} label="Webhook URL" />
      </Field>
      {#if canEdit}
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onclick={() => (editing = true)} disabled={pending}>
            Replace secret
          </Button>
          <DisconnectButton
            name="Sentry"
            description="Alerts stop creating issues here. Issues already created and their Sentry links are kept."
            disabled={pending}
            {pending}
            onConfirm={disconnect}
          />
        </div>
      {/if}
    </div>
  {:else if canEdit}
    <ol
      class="flex max-w-2xl list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground"
    >
      <li>
        In Sentry, open
        <span class="text-foreground">Settings → Custom Integrations → Create New Integration</span>
        and choose <span class="text-foreground">Internal Integration</span>.
      </li>
      <li>
        Set the Webhook URL to:
        <div class="mt-1.5">
          <CopyField value={webhookUrl} label="Webhook URL" />
        </div>
      </li>
      <li>
        Turn on <span class="text-foreground">Alert Rule Action</span>, give it
        <span class="text-foreground">Issue &amp; Event: Read</span>, and under Webhooks subscribe to
        <span class="text-foreground">issue</span> (for resolves). Save.
      </li>
      <li>Paste the integration&apos;s Client Secret below (and a token for event counts).</li>
      <li>
        In an issue alert rule, add the action
        <span class="text-foreground">Send a notification via &lt;your integration&gt;</span>.
      </li>
    </ol>
    <SentryForm
      {projectId}
      onDone={() => (editing = false)}
      onCancel={sentry ? () => (editing = false) : undefined}
    />
  {:else}
    <p class="text-sm text-muted-foreground">Not connected.</p>
  {/if}
</section>
