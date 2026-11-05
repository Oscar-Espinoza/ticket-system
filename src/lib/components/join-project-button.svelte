<!--
  JoinProjectButton (port of src/components/join-project-button.tsx) — explicit
  POST to joinProject (joining never happens on render). The action redirects
  into the project on success (the generated wrapper follows it with goto), so
  there is no client-side navigation here.
-->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { joinProject, type JoinProjectState } from '@/lib/actions/join';
  import { Button } from '@/lib/components/ui/button';

  const ERROR_MESSAGE: Record<NonNullable<JoinProjectState['error']>, string> = {
    invalid: 'Unable to join. The invitation may have expired or already been used.',
    'wrong-account': 'This invitation was sent to a different email address.',
    'Not authenticated': 'Your session expired. Sign in again to join.',
  };

  let { token }: { token: string } = $props();

  // useActionState(joinProject, {})
  let actionState = $state<JoinProjectState>({});
  let isPending = $state(false);

  async function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    isPending = true;
    try {
      actionState = (await joinProject(actionState, formData)) ?? actionState;
    } finally {
      isPending = false;
    }
  }
</script>

<form {onsubmit}>
  <input type="hidden" name="token" value={token} />
  <Button type="submit" class="mt-6 w-full" disabled={isPending}>
    {#if isPending}
      <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
      Joining&hellip;
    {:else}
      Join project
    {/if}
  </Button>
  {#if actionState.error}
    <p role="alert" class="mt-2 text-sm text-destructive">
      {ERROR_MESSAGE[actionState.error]}
    </p>
  {/if}
</form>
