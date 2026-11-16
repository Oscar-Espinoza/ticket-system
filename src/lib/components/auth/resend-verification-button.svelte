<!--
  "Send verification email": asks Better Auth (/send-verification-email) to
  email the signed-in user's own address a fresh link. Used by the dashboard
  banner, Settings → Profile and the landing page, only for a signed-in,
  unverified user and only when the server reports verification as available
  (emailVerificationAvailable). The server refuses signed-out callers, always
  lands the link on /email-verification → /dashboard, and sends at most one
  email a minute per account, so the copy promises no more than that.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import MailIcon from '@lucide/svelte/icons/mail';

  import { authClient } from '@/lib/svelte/auth-client';
  import { Button, type ButtonSize, type ButtonVariant } from '@/lib/components/ui/button';

  let {
    email,
    label = m.auth_resend_label(),
    variant = 'outline',
    size = 'sm',
    class: className = '',
  }: {
    /** The signed-in user's address. */
    email: string;
    label?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
  } = $props();

  let sending = $state(false);
  let status = $state<{ ok: boolean; text: string } | null>(null);

  async function send() {
    sending = true;
    status = null;
    const { error } = await authClient.sendVerificationEmail({ email });
    sending = false;
    if (!error) {
      status = {
        ok: true,
        text: m.auth_resend_sent({ email }),
      };
    } else if (error.code === 'EMAIL_ALREADY_VERIFIED') {
      status = { ok: true, text: m.auth_resend_already() };
    } else if (error.status === 401) {
      status = { ok: false, text: m.auth_resend_signed_out() };
    } else if (error.status === 429) {
      status = { ok: false, text: m.auth_too_many_requests() };
    } else if (error.code === 'VERIFICATION_EMAIL_NOT_ENABLED') {
      status = { ok: false, text: m.auth_resend_not_enabled() };
    } else {
      status = { ok: false, text: m.auth_email_send_failed() };
    }
  }
</script>

<div class="flex flex-col gap-2 {className}">
  <Button type="button" {variant} {size} class="self-start" disabled={sending} onclick={send}>
    {#if sending}<Loader2Icon class="animate-spin" />{:else}<MailIcon />{/if}
    {sending ? m.auth_forgot_sending() : label}
  </Button>
  {#if status}
    <p role="status" class="text-sm {status.ok ? 'text-muted-foreground' : 'text-destructive'}">{status.text}</p>
  {/if}
</div>
