<!--
  Explicit POST to acceptWorkspaceInvite (visiting the invite page never
  joins). The action redirects into the workspace on success.
-->
<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

  import { acceptWorkspaceInvite, type AcceptWorkspaceInviteState } from '@/lib/actions/workspaces';
  import { Button } from '@/lib/components/ui/button';

  let { token }: { token: string } = $props();

  const ERROR_MESSAGE: Record<NonNullable<AcceptWorkspaceInviteState['error']>, string> = {
    invalid: 'This invitation is invalid, has expired or was already used.',
    'wrong-account': 'This invitation was sent to a different email address.',
    'Not authenticated': 'Your session expired. Sign in again to join.',
  };

  let formState = $state.raw<AcceptWorkspaceInviteState>({});
  let isPending = $state(false);

  async function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (isPending) return;
    const data = new FormData(event.currentTarget);
    isPending = true;
    try {
      // On success the wrapper follows the action's redirect and resolves undefined.
      const next = await acceptWorkspaceInvite(formState, data);
      if (next) formState = next;
    } finally {
      isPending = false;
    }
  }
</script>

<form {onsubmit}>
  <input type="hidden" name="token" value={token} />
  <Button type="submit" class="mt-6 w-full" disabled={isPending}>
    {#if isPending}
      <LoaderCircleIcon class="animate-spin" />
      Joining…
    {:else}
      Join workspace
    {/if}
  </Button>
  {#if formState.error}
    <p role="alert" class="mt-2 text-sm text-destructive">
      {ERROR_MESSAGE[formState.error]}
    </p>
  {/if}
</form>
