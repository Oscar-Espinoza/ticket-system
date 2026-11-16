<!--
  "Your account was secured": shown once (dashboard layout, first page of a new
  session) after an unverified account was claimed by a password reset or a
  first single sign-on (src/lib/server/account-claim.ts). Lists what was
  removed and what to set up again. Also used by the reset page's success
  state (`compact`, no dismiss).
-->
<script lang="ts">
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import XIcon from '@lucide/svelte/icons/x';

  import { claimAftercare, type ClaimReport, claimedItems } from '@/lib/account-claim';
  import { formatDate, m } from '@/lib/i18n';
  import { Button } from '@/lib/components/ui/button';

  let {
    removed,
    via,
    at = null,
    dismissible = true,
  }: { removed: ClaimReport; via: 'sso' | 'password_reset'; at?: string | null; dismissible?: boolean } = $props();

  let dismissed = $state(false);
  const items = $derived(claimedItems(removed));
  const when = $derived(at ? formatDate(at, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }) : null);
  const body = $derived(
    via === 'sso'
      ? when
        ? m.auth_claim_secured_body_sso_at({ when })
        : m.auth_claim_secured_body_sso()
      : when
        ? m.auth_claim_secured_body_reset_at({ when })
        : m.auth_claim_secured_body_reset(),
  );
</script>

{#if !dismissed}
  <div
    data-account-secured-notice
    role="status"
    class="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm"
  >
    <ShieldCheckIcon class="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <p>
        <span class="font-medium">{m.auth_claim_secured_title()}</span>
        {body}
      </p>
      {#if items.length > 0}
        <div>
          <p class="font-medium">{m.auth_claim_removed()}</p>
          <ul class="list-disc pl-5" data-claim-removed>
            {#each items as entry (entry.item)}
              <li>{entry.label}{entry.count > 1 ? ` (${entry.count})` : ''}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <p>{m.auth_claim_nothing_else()}</p>
      {/if}
      <div>
        <p class="font-medium">{m.auth_claim_what_now()}</p>
        <ul class="list-disc pl-5">
          {#each claimAftercare() as line (line)}
            <li>{line}</li>
          {/each}
        </ul>
      </div>
      <p class="text-muted-foreground">{m.auth_claim_also_emailed()}</p>
    </div>
    {#if dismissible}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="-my-1 shrink-0"
        aria-label={m.auth_dismiss()}
        onclick={() => (dismissed = true)}
      >
        <XIcon />
      </Button>
    {/if}
  </div>
{/if}
