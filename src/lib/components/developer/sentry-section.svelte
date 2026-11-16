<script lang="ts">
  import { m } from '@/lib/i18n';
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
      else toast.success(m.settings_dev_sentry_disconnected_toast());
    } finally {
      pending = false;
    }
  }
</script>

<section class="flex flex-col gap-4" aria-label={'Sentry'}>
  <SectionHeading
    title={'Sentry'}
    description={m.settings_dev_sentry_description()}
  >
    {#snippet icon()}<SentryMark class="size-4 text-[#7553ff]" />{/snippet}
  </SectionHeading>

  {#if sentry && !editing}
    <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div class="flex items-center gap-2 text-sm">
        <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
        {m.settings_dev_connected()}
        <span class="text-muted-foreground">
          · {sentry.hasToken ? m.settings_dev_sentry_counts_on() : m.settings_dev_sentry_no_token()}
        </span>
        {#if sentry.connectedByName}
          <span class="ml-auto text-xs text-muted-foreground">
            {m.settings_dev_connected_by({ name: sentry.connectedByName })}
          </span>
        {/if}
      </div>
      <Field id="sentry-url" label={m.settings_dev_webhook_url()}>
        <CopyField value={webhookUrl} label={m.settings_dev_webhook_url()} />
      </Field>
      {#if canEdit}
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onclick={() => (editing = true)} disabled={pending}>
            {m.settings_dev_replace_secret()}
          </Button>
          <DisconnectButton
            name="Sentry"
            description={m.settings_dev_sentry_disconnect_desc()}
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
        {m.settings_dev_sentry_step1()}
      </li>
      <li>
        {m.settings_dev_sentry_step2()}
        <div class="mt-1.5">
          <CopyField value={webhookUrl} label={m.settings_dev_webhook_url()} />
        </div>
      </li>
      <li>
        {m.settings_dev_sentry_step3()}
      </li>
      <li>{m.settings_dev_sentry_step4()}</li>
      <li>
        {m.settings_dev_sentry_step5()}
      </li>
    </ol>
    <SentryForm
      {projectId}
      onDone={() => (editing = false)}
      onCancel={sentry ? () => (editing = false) : undefined}
    />
  {:else}
    <p class="text-sm text-muted-foreground">{m.settings_dev_not_connected()}</p>
  {/if}
</section>
