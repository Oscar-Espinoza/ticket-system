<script lang="ts">
  import PasswordForm from '@/lib/components/settings/password-form.svelte';
  import ProfileForm from '@/lib/components/settings/profile-form.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Profile · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Profile</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">How you appear to teammates across every project.</p>

<ProfileForm
  email={data.profile.email}
  name={data.profile.name}
  image={data.profile.image}
  title={data.profile.title}
  bio={data.profile.bio}
  timezone={data.profile.timezone}
  timezones={data.profile.timezones}
/>

<Separator class="my-10" />

<h2 class="text-base font-medium">Password</h2>
{#if data.hasPassword}
  <PasswordForm />
{:else}
  <p class="mt-2 text-sm text-muted-foreground">You sign in with GitHub, Google or single sign-on, so there is no password to change.</p>
{/if}
