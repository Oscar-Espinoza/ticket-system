<!-- Switches save as they flip (optimistic; reverted with a toast on failure). -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import Send from '@lucide/svelte/icons/send';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Separator } from '@/lib/components/ui/separator';
  import { sendTestEmail, updateNotificationPrefs } from '@/lib/actions/notifications';
  import { updateDeliverySettings } from '@/lib/actions/settings-notifications';
  import {
    isDigestFrequency,
    NOTIFICATION_PREFS,
    prefEnabled,
    type DigestFrequency,
  } from '@/lib/notifications/types';
  import SwitchRow from './switch-row.svelte';

  const DIGEST_LABEL: Record<DigestFrequency, string> = {
    off: 'Off',
    daily: 'Daily',
    weekly: 'Weekly (Mondays)',
  };
  const digestItems = (Object.keys(DIGEST_LABEL) as DigestFrequency[]).map((value) => ({
    value,
    label: DIGEST_LABEL[value],
  }));

  let {
    email,
    emailEnabled: initialEmail,
    digest: initialDigest,
    prefs: initialPrefs,
    pushSection,
  }: {
    email: string;
    emailEnabled: boolean;
    digest: DigestFrequency;
    prefs: Record<string, boolean>;
    /** Rendered between Email and the per-type toggles (Push settings). */
    pushSection?: Snippet;
  } = $props();

  // useState(initial…): seeded once.
  let emailEnabled = $state(untrack(() => initialEmail));
  let digest = $state<DigestFrequency>(untrack(() => initialDigest));
  let prefs = $state<Record<string, boolean>>(untrack(() => ({ ...initialPrefs })));
  let testing = $state(false);

  async function save(patch: Parameters<typeof updateNotificationPrefs>[0], revert: () => void) {
    const result = await updateNotificationPrefs(patch).catch(() => null);
    if (!result?.ok) {
      revert();
      toast.error(result?.error ?? 'Could not save your settings');
    }
  }

  function toggleEmail(on: boolean) {
    emailEnabled = on;
    void save({ email: on }, () => (emailEnabled = !on));
  }

  function togglePref(type: string, on: boolean) {
    prefs = { ...prefs, [type]: on };
    void save({ prefs: { [type]: on } }, () => (prefs = { ...prefs, [type]: !on }));
  }

  function changeDigest(value: string) {
    if (!isDigestFrequency(value)) return;
    const previous = digest;
    digest = value;
    void updateDeliverySettings({ digest: value })
      .catch(() => null)
      .then((result) => {
        if (result?.ok) return;
        digest = previous;
        toast.error(result?.error ?? 'Could not save your settings');
      });
  }

  async function test() {
    testing = true;
    try {
      const result = await sendTestEmail().catch(() => null);
      if (!result?.ok) toast.error(result?.error ?? 'Could not send the test email');
      else if (result.delivered) toast.success(`Test email sent to ${email}`);
      else
        toast.warning('Email delivery is not configured on this server', {
          description: 'Set RESEND_API_KEY and EMAIL_FROM. The message was written to the server log.',
        });
    } finally {
      testing = false;
    }
  }
</script>

<div class="flex flex-col gap-10">
  <section>
    <h2 class="mb-1 text-base font-medium">Email</h2>
    <p class="mb-4 text-sm text-muted-foreground">
      Notifications are always in your inbox. Email copies go to {email}.
    </p>
    <SwitchRow
      id="notify-email"
      label="Email me about notifications"
      description="One email per batch of updates, linking back to the issue."
      checked={emailEnabled}
      onChange={toggleEmail}
    />
    <div class="mt-4 flex items-center gap-4">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label for="notify-digest">Email digest</Label>
        <p class="text-xs text-muted-foreground">
          Bundle updates into one email. Assignments and mentions still email you right away.
        </p>
      </div>
      <Select
        items={digestItems}
        bind:value={() => digest, changeDigest}
        disabled={!emailEnabled}
      >
        <SelectTrigger id="notify-digest" size="sm" class="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {#each digestItems as item (item.value)}
            <SelectItem value={item.value}>{item.label}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </div>
    <Button variant="outline" size="sm" class="mt-4" onclick={test} disabled={testing}>
      <Send />
      {testing ? 'Sending…' : 'Send test email'}
    </Button>
  </section>

  <Separator />

  {#if pushSection}
    <section>
      <h2 class="mb-1 text-base font-medium">Push</h2>
      <p class="mb-4 text-sm text-muted-foreground">
        System notifications on this computer or phone, even when the app isn’t open.
      </p>
      {@render pushSection()}
    </section>
    <Separator />
  {/if}

  <section>
    <h2 class="mb-1 text-base font-medium">Notify me when</h2>
    <p class="mb-4 text-sm text-muted-foreground">
      Turning a type off stops its inbox item, email and push. Reminders you set are always
      delivered.
    </p>
    <div class="flex flex-col divide-y divide-border rounded-lg border border-border">
      {#each NOTIFICATION_PREFS as pref (pref.type)}
        <SwitchRow
          id="notify-{pref.type}"
          label={pref.label}
          description={pref.description}
          checked={prefEnabled(prefs, pref.type)}
          onChange={(on) => togglePref(pref.type, on)}
          class="px-4 py-3"
        />
      {/each}
    </div>
  </section>
</div>
