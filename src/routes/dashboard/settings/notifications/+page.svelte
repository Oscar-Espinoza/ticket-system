<script lang="ts">
  import { m } from '@/lib/i18n';
  import NotificationPrefsForm from '@/lib/components/inbox/notification-prefs-form.svelte';
  import PushSettings from '@/lib/components/pwa/push-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_notifications_title()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_notifications()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_notifications_desc()}
</p>
<NotificationPrefsForm
  email={data.email}
  emailEnabled={data.emailEnabled}
  digest={data.digest}
  prefs={data.prefs}
>
  {#snippet pushSection()}
    <PushSettings
      configured={data.push.configured}
      publicKey={data.push.publicKey}
      enabled={data.push.enabled}
      devices={data.push.devices}
    />
  {/snippet}
</NotificationPrefsForm>
