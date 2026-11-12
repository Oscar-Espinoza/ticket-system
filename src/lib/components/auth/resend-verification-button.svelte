<!--
  "Send verification email": asks Better Auth (/send-verification-email) to
  email `email` a fresh link that lands on /email-verification and then goes to
  `redirectTo`. Used by the dashboard banner, Settings → Profile, the landing
  page and the sign-in form. Render it only when the server reports
  verification as available (emailVerificationAvailable). Better Auth answers
  "sent" for unknown or already-verified addresses when signed out, and the
  server sends at most one email a minute per account, so the copy promises
  no more than that.
-->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import MailIcon from '@lucide/svelte/icons/mail';

  import { authClient } from '@/lib/svelte/auth-client';
  import { Button, type ButtonSize, type ButtonVariant } from '@/lib/components/ui/button';

  let {
    email,
    redirectTo = '/dashboard',
    label = 'Send verification email',
    variant = 'outline',
    size = 'sm',
    class: className = '',
  }: {
    /** The address to verify; the button is disabled while it's empty. */
    email: string;
    redirectTo?: string;
    label?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
  } = $props();

  let sending = $state(false);
  let status = $state<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!email.includes('@')) {
      status = { ok: false, text: 'Enter your email address first.' };
      return;
    }
    sending = true;
    status = null;
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: redirectTo });
    sending = false;
    if (!error) {
      status = {
        ok: true,
        text: `If ${email} needs verifying, a link is on its way. Check your inbox and spam folder; you can ask for a new link once a minute.`,
      };
    } else if (error.code === 'EMAIL_ALREADY_VERIFIED') {
      status = { ok: true, text: 'This address is already verified. Reload the page.' };
    } else if (error.status === 429) {
      status = { ok: false, text: 'Too many requests. Wait a minute and try again.' };
    } else if (error.code === 'VERIFICATION_EMAIL_NOT_ENABLED') {
      status = { ok: false, text: 'This server can’t send email. Ask your admin to verify your address.' };
    } else {
      status = { ok: false, text: 'Couldn’t send the email. Try again.' };
    }
  }
</script>

<div class="flex flex-col gap-2 {className}">
  <Button type="button" {variant} {size} class="self-start" disabled={sending} onclick={send}>
    {#if sending}<Loader2Icon class="animate-spin" />{:else}<MailIcon />{/if}
    {sending ? 'Sending…' : label}
  </Button>
  {#if status}
    <p role="status" class="text-sm {status.ok ? 'text-muted-foreground' : 'text-destructive'}">{status.text}</p>
  {/if}
</div>
