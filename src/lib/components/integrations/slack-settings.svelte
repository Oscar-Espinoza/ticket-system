<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import SendIcon from '@lucide/svelte/icons/send';
  import { toast } from 'svelte-sonner';

  import { saveSlackSettings, sendSlackTest } from '@/lib/actions/integrations';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { SLACK_EVENTS, SLACK_URL_PREFIX, type SlackEventKind } from '@/lib/integrations/event-types';

  let {
    projectId,
    url: savedUrl,
    events: savedEvents,
  }: {
    projectId: string;
    /** Saved webhook URL, '' when not connected. */
    url: string;
    events: SlackEventKind[];
  } = $props();

  // svelte-ignore state_referenced_locally
  let connected = $state(Boolean(savedUrl));
  // svelte-ignore state_referenced_locally
  let url = $state(savedUrl);
  // svelte-ignore state_referenced_locally
  let events = $state.raw<SlackEventKind[]>(savedUrl ? savedEvents : SLACK_EVENTS.map((e) => e.kind));
  let error = $state<string>();
  let saving = $state(false);
  let testing = $state(false);

  async function save(nextUrl = url) {
    saving = true;
    try {
      const result = await saveSlackSettings({ projectId, url: nextUrl, events });
      if (!result) return;
      if (!result.ok) {
        if (result.field === 'url') error = result.error;
        else toast.error(result.error);
        return;
      }
      error = undefined;
      connected = result.connected;
      if (!result.connected) url = '';
      toast.success(result.connected ? 'Slack settings saved' : 'Slack disconnected');
    } finally {
      saving = false;
    }
  }

  async function test() {
    testing = true;
    try {
      const result = await sendSlackTest({ projectId });
      if (!result) return;
      if (result.ok) toast.success('Test message sent');
      else toast.error(result.error);
    } finally {
      testing = false;
    }
  }

  const toggle = (kind: SlackEventKind, on: boolean) =>
    (events = on ? [...events, kind] : events.filter((k) => k !== kind));
</script>

<section class="flex flex-col gap-5">
  <div>
    <h2 class="text-base font-medium">Slack</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Post issue activity to a channel through a Slack
      <a
        href="https://api.slack.com/messaging/webhooks"
        target="_blank"
        rel="noreferrer"
        class="underline underline-offset-2 hover:text-foreground">incoming webhook</a
      >.
    </p>
  </div>

  <form
    class="flex flex-col gap-5"
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <Field id="slack-url" label="Webhook URL" {error}>
      <Input
        id="slack-url"
        bind:value={() => url, (v) => {
          url = v;
          error = undefined;
        }}
        placeholder="{SLACK_URL_PREFIX}services/…"
        autocomplete="off"
        spellcheck={false}
        class="font-mono text-xs"
        aria-invalid={!!error}
        aria-describedby={error ? 'slack-url-error' : undefined}
      />
    </Field>

    <fieldset class="flex flex-col gap-2.5">
      <legend class="mb-2 text-sm font-medium">Post when</legend>
      {#each SLACK_EVENTS as { kind, label } (kind)}
        <div class="flex items-center gap-3">
          <Switch
            id="slack-{kind}"
            size="sm"
            bind:checked={() => events.includes(kind), (on) => toggle(kind, on)}
          />
          <Label for="slack-{kind}" class="font-normal">{label}</Label>
        </div>
      {/each}
    </fieldset>

    <div class="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={saving || !url.trim()}>
        {#if saving}<LoaderCircleIcon class="animate-spin" />{/if}
        {connected ? 'Save changes' : 'Connect Slack'}
      </Button>
      {#if connected}
        <Button type="button" variant="outline" onclick={test} disabled={testing}>
          {#if testing}<LoaderCircleIcon class="animate-spin" />{:else}<SendIcon />{/if}
          Send test message
        </Button>
        <Button
          type="button"
          variant="ghost"
          class="text-muted-foreground"
          onclick={() => save('')}
          disabled={saving}
        >
          Disconnect
        </Button>
      {/if}
    </div>
  </form>
</section>
