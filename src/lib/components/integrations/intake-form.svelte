<!--
  Public intake form (/request/[token]). No app chrome; every state renders
  inline.
-->
<script lang="ts">
  import IntakeFormBody from './intake-form-body.svelte';

  let { token, stamp }: { token: string; stamp: string } = $props();

  // Remounting the form after "Submit another" resets the action state.
  let round = $state(0);
</script>

{#key round}
  <IntakeFormBody {token} {stamp} onAgain={() => (round += 1)} />
{/key}
