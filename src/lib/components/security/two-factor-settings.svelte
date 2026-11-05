<!--
  Settings → Security → Two-factor authentication (Better Auth twoFactor).
  Port of src/components/security/two-factor-settings.tsx; the dialogs live in
  two-factor-enable-dialog / two-factor-password-dialog /
  two-factor-regenerate-dialog.svelte.
-->
<script lang="ts">
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
    Two-factor authentication protects password sign-in. You sign in with GitHub or single sign-on,
    so the two-factor settings of that account apply.
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
          Authenticator app
          {#if enabled}<LabelChip color="done">Enabled</LabelChip>{:else}<LabelChip>Off</LabelChip>{/if}
        </p>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {enabled
            ? 'Password sign-ins ask for a 6-digit code from your authenticator app, or a backup code.'
            : 'Ask for a 6-digit code from an app like 1Password, Google Authenticator or Authy after your password.'}
        </p>
      </div>
      {#if !enabled}
        <Button size="sm" onclick={() => (mode = 'enable')}>Enable</Button>
      {/if}
    </div>
    {#if enabled}
      <div class="flex flex-wrap gap-2 pl-11">
        <Button variant="outline" size="sm" onclick={() => (mode = 'regenerate')}>
          <KeyRoundIcon />
          Regenerate backup codes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:text-destructive"
          onclick={() => (mode = 'disable')}
        >
          Disable
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
        title="Disable two-factor authentication?"
        description="Password sign-ins will no longer ask for a code. Your backup codes stop working."
        confirmLabel="Disable"
        destructive
        onClose={() => (mode = null)}
        onConfirm={async (password) => {
          const { error } = await authClient.twoFactor.disable({ password });
          if (error) return errorMessage(error);
          enabled = false;
          mode = null;
          toast.success('Two-factor authentication disabled');
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
