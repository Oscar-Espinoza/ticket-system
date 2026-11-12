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

  import { CLAIM_AFTERCARE, type ClaimReport, claimedItems } from '@/lib/account-claim';
  import { Button } from '@/lib/components/ui/button';

  let {
    removed,
    via,
    at = null,
    dismissible = true,
  }: { removed: ClaimReport; via: 'sso' | 'password_reset'; at?: string | null; dismissible?: boolean } = $props();

  let dismissed = $state(false);
  const items = $derived(claimedItems(removed));
  const when = $derived(at ? new Date(at).toLocaleString() : null);
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
        <span class="font-medium">Your account was secured.</span>
        Its email address had never been verified, so when
        {via === 'sso' ? 'you signed in with single sign-on' : 'the password was reset'}{when ? ` (${when})` : ''},
        every session was signed out and anything someone else could have set up was removed.
      </p>
      {#if items.length > 0}
        <div>
          <p class="font-medium">Removed</p>
          <ul class="list-disc pl-5" data-claim-removed>
            {#each items as entry (entry.item)}
              <li>{entry.label}{entry.count > 1 ? ` (${entry.count})` : ''}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <p>Nothing else was set up on the account.</p>
      {/if}
      <div>
        <p class="font-medium">What to do now</p>
        <ul class="list-disc pl-5">
          {#each CLAIM_AFTERCARE as line (line)}
            <li>{line}</li>
          {/each}
        </ul>
      </div>
      <p class="text-muted-foreground">We also emailed you this list.</p>
    </div>
    {#if dismissible}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="-my-1 shrink-0"
        aria-label="Dismiss"
        onclick={() => (dismissed = true)}
      >
        <XIcon />
      </Button>
    {/if}
  </div>
{/if}
