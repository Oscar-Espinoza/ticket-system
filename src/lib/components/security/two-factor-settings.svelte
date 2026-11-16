<!--
  Settings → Security → Two-factor authentication (Better Auth twoFactor).
  The dialogs live in
  two-factor-enable-dialog / two-factor-password-dialog /
  two-factor-regenerate-dialog.svelte.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import ShieldOffIcon from '@lucide/svelte/icons/shield-off';
  import { toast } from 'svelte-sonner';

  import { authClient } from '@/lib/svelte/auth-client';
  import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { LabelChip } from '@/lib/components/ui-icons';
  import EnableDialog from './two-factor-enable-dialog.svelte';
  import PasswordDialog from './two-factor-password-dialog.svelte';
  import RegenerateDialog from './two-factor-regenerate-dialog.svelte';
  import { errorMessage } from './two-factor-errors';

  type Mode = 'enable' | 'disable' | 'regenerate' | null;

  let { enabled: initialEnabled, hasPassword }: { enabled: boolean; hasPassword: boolean } = $props();

  let enabled = $state(untrack(() => initialEnabled));
  let mode = $state<Mode>(null);
</script>

{#if !hasPassword}
  <div class="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
    {m.settings_sec_2fa_no_password()}
  </div>
{:else}
  <div class="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
    <div class="flex items-start gap-3">
      <span
        aria-hidden="true"
        class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        {#if enabled}<ShieldCheckIcon class="size-4" />{:else}<ShieldOffIcon class="size-4" />{/if}
      </span>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-2 text-sm font-medium">
          {m.settings_sec_authenticator_app()}
          {#if enabled}<LabelChip color="done">{m.settings_sec_enabled()}</LabelChip>{:else}<LabelChip>{m.settings_sec_off()}</LabelChip>{/if}
        </p>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {enabled
            ? m.settings_sec_2fa_on_desc()
            : m.settings_sec_2fa_off_desc()}
        </p>
      </div>
      {#if !enabled}
        <Button size="sm" onclick={() => (mode = 'enable')}>{m.settings_sec_enable()}</Button>
      {/if}
    </div>
    {#if enabled}
      <div class="flex flex-wrap gap-2 pl-11">
        <Button variant="outline" size="sm" onclick={() => (mode = 'regenerate')}>
          <KeyRoundIcon />
          {m.settings_sec_regen_codes()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:text-destructive"
          onclick={() => (mode = 'disable')}
        >
          {m.settings_sec_disable()}
        </Button>
      </div>
    {/if}

    {#if mode === 'enable'}
      <EnableDialog
        onClose={(done) => {
          mode = null;
          if (done) {
            enabled = true;
            void refreshAfterWrite();
          }
        }}
      />
    {/if}
    {#if mode === 'disable'}
      <PasswordDialog
        title={m.settings_sec_disable_title()}
        description={m.settings_sec_disable_desc()}
        confirmLabel={m.settings_sec_disable()}
        destructive
        onClose={() => (mode = null)}
        onConfirm={async (password) => {
          const { error } = await authClient.twoFactor.disable({ password });
          if (error) return errorMessage(error);
          enabled = false;
          mode = null;
          toast.success(m.settings_sec_2fa_disabled_toast());
          void refreshAfterWrite();
          return null;
        }}
      />
    {/if}
    {#if mode === 'regenerate'}
      <RegenerateDialog onClose={() => (mode = null)} />
    {/if}
  </div>
{/if}
