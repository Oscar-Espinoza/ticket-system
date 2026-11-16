<script lang="ts">
  import { m } from '@/lib/i18n';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import ResendVerificationButton from '@/lib/components/auth/resend-verification-button.svelte';
  import PasswordForm from '@/lib/components/settings/password-form.svelte';
  import LanguageForm from '@/lib/components/settings/language-form.svelte';
  import ProfileForm from '@/lib/components/settings/profile-form.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_profile_title()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_profile()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">{m.settings_page_profile_desc()}</p>

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

<LanguageForm locale={data.locale} />

<Separator class="my-10" />

<h2 class="text-base font-medium">{m.settings_page_email_verification()}</h2>
{#if data.emailVerified}
  <p class="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground" data-email-verified>
    <CircleCheckIcon class="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
    {m.settings_page_email_verified({ email: data.profile.email })}
  </p>
{:else if data.verificationAvailable}
  <p class="mt-2 mb-3 text-sm text-muted-foreground">
    {m.settings_page_email_unverified({ email: data.profile.email })}
  </p>
  <ResendVerificationButton email={data.profile.email} />
{:else}
  <p class="mt-2 text-sm text-muted-foreground">
    {m.settings_page_email_unverified_no_mail({ email: data.profile.email })}
  </p>
{/if}

<Separator class="my-10" />

<h2 class="text-base font-medium">{m.settings_sec_password()}</h2>
{#if data.hasPassword}
  <PasswordForm />
{:else}
  <p class="mt-2 text-sm text-muted-foreground">{m.settings_page_no_password()}</p>
{/if}
