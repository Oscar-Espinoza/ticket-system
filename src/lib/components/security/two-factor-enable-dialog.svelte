<!--
  Enable 2FA in three steps: confirm
  password → add the secret to an authenticator app and enter the first code
  (that verification is what turns 2FA on) → save the backup codes, shown once.
  No QR code: that would need a QR encoder dependency; every authenticator app
  accepts the secret (and phones open the otpauth:// link directly).
  Mounted only while open; `onClose(done)` reports whether 2FA is now on.
-->
<script module lang="ts">
  function secretFromUri(uri: string): string {
    try {
      return new URL(uri).searchParams.get('secret') ?? '';
    } catch {
      return '';
    }
  }

  const groupSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { authClient } from '@/lib/svelte/auth-client';
  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import BackupCodes from './backup-codes.svelte';
  import PasswordField from './two-factor-password-field.svelte';
  import { errorMessage } from './two-factor-errors';

  let { onClose }: { onClose: (done: boolean) => void } = $props();

  let step = $state<'password' | 'verify' | 'codes'>('password');
  let password = $state('');
  let code = $state('');
  let error = $state<string>();
  let pending = $state(false);
  let setup = $state<{ uri: string; secret: string; backupCodes: string[] } | null>(null);

  async function submitPassword(e: SubmitEvent) {
    e.preventDefault();
    if (!password) {
      error = m.settings_sec_enter_password();
      return;
    }
    pending = true;
    const { data, error: apiError } = await authClient.twoFactor.enable({ password });
    pending = false;
    if (apiError || !data) {
      error = errorMessage(apiError);
      return;
    }
    setup = {
      uri: data.totpURI,
      secret: secretFromUri(data.totpURI),
      backupCodes: data.backupCodes,
    };
    password = '';
    step = 'verify';
  }

  async function submitCode(e: SubmitEvent) {
    e.preventDefault();
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) {
      error = m.settings_sec_enter_code();
      return;
    }
    pending = true;
    const { error: apiError } = await authClient.twoFactor.verifyTotp({ code: digits });
    pending = false;
    if (apiError) {
      error =
        apiError.status === 429
          ? errorMessage(apiError)
          : m.settings_sec_code_mismatch();
      return;
    }
    toast.success(m.settings_sec_2fa_enabled_toast());
    step = 'codes';
  }

  const done = $derived(step === 'codes');
</script>

<Dialog open onOpenChange={(open) => !open && onClose(done)}>
  <DialogContent>
    {#if step === 'password'}
      <form onsubmit={submitPassword} novalidate class="flex flex-col gap-5">
        <DialogHeader>
          <DialogTitle>{m.settings_sec_2fa_enable_title()}</DialogTitle>
          <DialogDescription>{m.settings_sec_confirm_password()}</DialogDescription>
        </DialogHeader>
        <PasswordField
          value={password}
          {error}
          onChange={(v) => {
            password = v;
            error = undefined;
          }}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onclick={() => onClose(false)}>{m.common_cancel()}</Button>
          <Button type="submit" disabled={pending}>
            {#if pending}<Loader2Icon class="animate-spin" />{/if}
            {m.common_continue()}
          </Button>
        </DialogFooter>
      </form>
    {/if}

    {#if step === 'verify' && setup}
      <form onsubmit={submitCode} novalidate class="flex flex-col gap-5">
        <DialogHeader>
          <DialogTitle>{m.settings_sec_add_authenticator()}</DialogTitle>
          <DialogDescription>
            {@const parts = m.settings_sec_add_authenticator_desc({ link: '\u0000' }).split('\u0000')}
            {parts[0]}<a href={setup.uri}>{m.settings_sec_open_authenticator()}</a>{parts[1]}
          </DialogDescription>
        </DialogHeader>
        <Field id="two-factor-secret" label={m.settings_sec_setup_key()}>
          <CopyField id="two-factor-secret" value={groupSecret(setup.secret)} label={m.settings_sec_setup_key()} />
        </Field>
        <Field id="two-factor-uri" label={m.settings_sec_setup_link_field()}>
          <CopyField id="two-factor-uri" value={setup.uri} label={m.settings_sec_setup_link()} />
        </Field>
        <Field id="two-factor-code" label={m.settings_sec_six_digit_code()} {error}>
          <Input
            id="two-factor-code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength={7}
            autofocus
            placeholder="123456"
            class="font-mono tracking-widest"
            bind:value={
              () => code,
              (v) => {
                code = (v ?? '').replace(/[^\d ]/g, '');
                error = undefined;
              }
            }
            aria-invalid={!!error}
            aria-describedby={error ? 'two-factor-code-error' : undefined}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onclick={() => onClose(false)}>{m.common_cancel()}</Button>
          <Button type="submit" disabled={pending}>
            {#if pending}<Loader2Icon class="animate-spin" />{/if}
            {m.settings_sec_verify_enable()}
          </Button>
        </DialogFooter>
      </form>
    {/if}

    {#if step === 'codes' && setup}
      <div class="flex flex-col gap-5">
        <DialogHeader>
          <DialogTitle>{m.settings_sec_save_codes()}</DialogTitle>
          <DialogDescription>
            {m.settings_sec_save_codes_desc()}
          </DialogDescription>
        </DialogHeader>
        <BackupCodes codes={setup.backupCodes} />
        <DialogFooter>
          <Button onclick={() => onClose(true)}>{m.common_done()}</Button>
        </DialogFooter>
      </div>
    {/if}
  </DialogContent>
</Dialog>
