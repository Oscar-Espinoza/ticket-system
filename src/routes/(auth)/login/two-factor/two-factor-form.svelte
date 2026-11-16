<!--
  TOTP code (auto-submits at 6 digits) or a one-time backup code, plus
  "trust this device" (skips the code on this browser for 30 days).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { goto } from '$app/navigation';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { authClient } from '@/lib/svelte/auth-client';
  import { Button } from '@/lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Checkbox } from '@/lib/components/ui/checkbox';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { authHref } from '@/lib/safe-redirect';

  type ApiError = { status?: number; code?: string; message?: string };

  function errorCopy(error: ApiError, backup: boolean): { message: string; expired?: boolean } {
    if (error.code === 'INVALID_TWO_FACTOR_COOKIE' || error.status === 401) {
      return { message: m.auth_2fa_expired(), expired: true };
    }
    if (error.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
      return { message: m.auth_2fa_locked(), expired: true };
    }
    if (error.status === 429) return { message: m.auth_login_too_many() };
    return {
      message: backup
        ? m.auth_2fa_backup_invalid()
        : m.auth_2fa_code_mismatch(),
    };
  }

  let { redirectTo }: { redirectTo: string } = $props();

  let backup = $state(false);
  let code = $state('');
  let trustDevice = $state(false);
  let error = $state<{ message: string; expired?: boolean } | null>(null);
  let loading = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  async function verify(value: string) {
    const trimmed = value.trim();
    if (backup ? trimmed.length < 6 : !/^\d{6}$/.test(trimmed)) {
      error = { message: backup ? m.auth_2fa_enter_backup() : m.auth_2fa_enter_code() };
      return;
    }
    loading = true;
    error = null;
    const { data, error: apiError } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: trimmed, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code: trimmed, trustDevice });
    if (apiError) {
      loading = false;
      error = errorCopy(apiError, backup);
      code = '';
      inputEl?.focus();
      return;
    }
    // Mid OAuth-provider flow the client follows `{ redirect, url }` itself.
    if (data && 'redirect' in data && data.redirect) return;
    // router.push(redirectTo) + router.refresh()
    await goto(redirectTo, { refreshAll: true });
  }

  // Controlled input: digits only in TOTP mode; auto-submit at 6 digits.
  function setCode(raw: string) {
    const next = backup ? raw : raw.replace(/\D/g, '');
    code = next;
    error = null;
    if (!backup && next.length === 6) void verify(next);
  }

  function toggleBackup() {
    backup = !backup;
    code = '';
    error = null;
    inputEl?.focus();
  }
</script>

<Card class="w-full max-w-sm">
  <CardHeader>
    <CardTitle>{m.auth_2fa_title()}</CardTitle>
    <CardDescription>
      {backup
        ? m.auth_2fa_description_backup()
        : m.auth_2fa_description_totp()}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form
      novalidate
      class="flex flex-col gap-4"
      onsubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
    >
      <div class="flex flex-col gap-2">
        <Label for="code">{backup ? m.auth_2fa_backup_code() : m.auth_2fa_code()}</Label>
        <Input
          bind:ref={inputEl}
          id="code"
          autofocus
          autocomplete="one-time-code"
          inputmode={backup ? 'text' : 'numeric'}
          maxlength={backup ? 32 : 6}
          placeholder={backup ? 'xxxxx-xxxxx' : '123456'}
          class="font-mono tracking-widest"
          bind:value={() => code, setCode}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'code-error' : undefined}
        />
        {#if error}
          <p id="code-error" class="text-destructive text-sm">
            {error.message}
            {#if error.expired}
              <a href={authHref('/login', redirectTo)} class="underline underline-offset-4">{m.auth_2fa_sign_in_again()}</a>
            {/if}
          </p>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <Checkbox
          id="trust-device"
          checked={trustDevice}
          onCheckedChange={(checked) => (trustDevice = checked === true)}
        />
        <Label for="trust-device" class="font-normal">{m.auth_2fa_trust()}</Label>
      </div>

      <Button type="submit" class="w-full" disabled={loading}>
        {#if loading}<Loader2Icon class="animate-spin" />{/if}
        {loading ? m.auth_2fa_verifying() : m.auth_2fa_verify()}
      </Button>
      <div class="flex items-center justify-between text-sm">
        <button
          type="button"
          class="text-muted-foreground underline-offset-4 hover:underline"
          onclick={toggleBackup}
        >
          {backup ? m.auth_2fa_use_app() : m.auth_2fa_use_backup()}
        </button>
        <a
          href={authHref('/login', redirectTo)}
          class="text-muted-foreground underline-offset-4 hover:underline"
        >
          {m.common_cancel()}
        </a>
      </div>
    </form>
  </CardContent>
</Card>
