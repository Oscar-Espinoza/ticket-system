<script lang="ts">
  import NotificationPrefsForm from '@/lib/components/inbox/notification-prefs-form.svelte';
  import PushSettings from '@/lib/components/pwa/push-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Notifications · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Notifications</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Choose what lands in your inbox and how else it reaches you.
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
