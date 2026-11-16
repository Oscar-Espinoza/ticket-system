<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { connectSentry } from '@/lib/actions/developer';
  import Callout from '@/lib/components/settings/callout.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';

  let {
    projectId,
    onDone,
    onCancel,
  }: {
    projectId: string;
    onDone: () => void;
    onCancel?: () => void;
  } = $props();

  let secret = $state('');
  let token = $state('');
  let error = $state<string | null>(null);
  let pending = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    pending = true;
    try {
      const result = await connectSentry({ projectId, clientSecret: secret, authToken: token });
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success(m.settings_dev_sentry_connected_toast());
      secret = '';
      token = '';
      onDone();
    } finally {
      pending = false;
    }
  }
</script>

<form onsubmit={submit} class="flex max-w-xl flex-col gap-4">
  <Field
    id="sentry-secret"
    label={m.settings_dev_sentry_secret()}
    hint={m.settings_dev_sentry_secret_hint()}
  >
    <Input
      id="sentry-secret"
      type="password"
      bind:value={secret}
      autocomplete="off"
      required
      disabled={pending}
    />
  </Field>
  <Field
    id="sentry-token"
    label={m.settings_dev_sentry_token()}
    hint={m.settings_dev_sentry_token_hint()}
  >
    <Input
      id="sentry-token"
      type="password"
      bind:value={token}
      autocomplete="off"
      disabled={pending}
    />
  </Field>
  {#if error}
    <Callout tone="error">{error}</Callout>
  {/if}
  <div class="flex gap-2">
    <Button type="submit" disabled={pending || !secret.trim()}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      {m.settings_dev_sentry_connect()}
    </Button>
    {#if onCancel}
      <Button type="button" variant="ghost" onclick={onCancel} disabled={pending}>{m.common_cancel()}</Button>
    {/if}
  </div>
</form>
