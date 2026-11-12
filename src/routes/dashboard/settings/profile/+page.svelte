<script lang="ts">
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import ResendVerificationButton from '@/lib/components/auth/resend-verification-button.svelte';
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

<h2 class="text-base font-medium">Email verification</h2>
{#if data.emailVerified}
  <p class="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground" data-email-verified>
    <CircleCheckIcon class="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
    {data.profile.email} is verified.
  </p>
{:else if data.verificationAvailable}
  <p class="mt-2 mb-3 text-sm text-muted-foreground">
    {data.profile.email} isn’t verified yet. Verify it to sign in with Google or GitHub using this address.
  </p>
  <ResendVerificationButton email={data.profile.email} redirectTo="/dashboard/settings/profile" />
{:else}
  <p class="mt-2 text-sm text-muted-foreground">
    {data.profile.email} isn’t verified, and this server doesn’t send email. To sign in with Google or GitHub using
    this address, ask your admin to verify it.
  </p>
{/if}

<Separator class="my-10" />

<h2 class="text-base font-medium">Password</h2>
{#if data.hasPassword}
  <PasswordForm />
{:else}
  <p class="mt-2 text-sm text-muted-foreground">You sign in with GitHub, Google or single sign-on, so there is no password to change.</p>
{/if}
