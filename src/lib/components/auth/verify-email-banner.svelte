<!--
  Dashboard banner for a signed-in user whose email isn't verified. The
  dashboard layout renders it only when verification is available (email
  configured), so it never asks for something the server can't do. "Dismiss"
  hides it for this browser session (sessionStorage; if that is blocked it
  hides until the next page load).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import MailIcon from '@lucide/svelte/icons/mail';
  import XIcon from '@lucide/svelte/icons/x';

  import ResendVerificationButton from './resend-verification-button.svelte';
  import { Button } from '@/lib/components/ui/button';

  let { email }: { email: string } = $props();

  const DISMISSED_KEY = 'verify-email-banner-dismissed';
  let dismissed = $state(false);

  onMount(() => {
    try {
      dismissed = window.sessionStorage.getItem(DISMISSED_KEY) === email;
    } catch {
      // Not remembered; the banner shows.
    }
  });

  function dismiss() {
    dismissed = true;
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, email);
    } catch {
      // Hidden until the next page load only.
    }
  }
</script>

{#if !dismissed}
  <div
    data-verify-email-banner
    class="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
  >
    <MailIcon class="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <p>
        <span class="font-medium">Verify your email address.</span>
        Open the link we sent to <span class="font-medium break-all">{email}</span>. Until then you can’t sign in
        with Google or GitHub using this address.
      </p>
      <ResendVerificationButton {email} label="Resend email" />
    </div>
    <Button type="button" variant="ghost" size="icon-sm" class="-my-1 shrink-0" aria-label="Dismiss" onclick={dismiss}>
      <XIcon />
    </Button>
  </div>
{/if}
