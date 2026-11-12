<script lang="ts">
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import Wordmark from '@/lib/components/wordmark.svelte';
  import ResendVerificationButton from '@/lib/components/auth/resend-verification-button.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { authHref } from '@/lib/safe-redirect';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const copy = $derived(
    {
      verified: {
        title: 'Email verified',
        body: data.signedIn
          ? 'Your email address is verified. You can now also sign in with Google or GitHub using it.'
          : 'Your email address is verified. Sign in to continue; you can now also sign in with Google or GitHub using it.',
      },
      expired: {
        title: 'This link has expired',
        body: data.signedIn
          ? `Verification links work for ${data.linkHours} hours. Send yourself a new one.`
          : `Verification links work for ${data.linkHours} hours. Sign in to send yourself a new one.`,
      },
      invalid: {
        title: 'This link doesn’t work',
        body: data.signedIn
          ? 'It may have been cut off when copied. Send yourself a new link.'
          : 'It may have been cut off when copied. Sign in to send yourself a new link.',
      },
      pending: {
        title: 'Verify your email',
        body: 'Open the link we emailed you, or send yourself a new one.',
      },
    }[data.state],
  );
</script>

<svelte:head>
  <title>{copy.title} · Ticket System</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        {#if data.state === 'verified'}
          <CircleCheckIcon class="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        {:else if data.state !== 'pending'}
          <TriangleAlertIcon class="size-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        {/if}
        {copy.title}
      </CardTitle>
      <CardDescription>{copy.body}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      {#if data.resendEmail}
        <ResendVerificationButton email={data.resendEmail} redirectTo={data.redirectTo} variant="default" size="default" />
      {/if}
      {#if data.signedIn}
        <Button href={data.redirectTo} variant={data.resendEmail ? 'ghost' : 'default'} class="w-full">Continue</Button>
      {:else}
        <Button href={authHref('/login', data.redirectTo)} class="w-full">Sign in</Button>
      {/if}
    </CardContent>
  </Card>
</div>
