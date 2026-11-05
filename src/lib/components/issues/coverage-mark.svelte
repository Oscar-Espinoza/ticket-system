<!-- Check when every target issue has it, minus when some do. (CoverageMark in issue-context-menu.tsx) -->
<script lang="ts">
  import CheckIcon from '@lucide/svelte/icons/check';
  import MinusIcon from '@lucide/svelte/icons/minus';

  import type { Coverage } from './issue-context-menu.svelte';

  let { coverage }: { coverage: Coverage } = $props();
</script>

{#if coverage === 'all'}
  <CheckIcon class="ml-auto size-3.5" aria-hidden="true" />
{:else if coverage === 'some'}
  <MinusIcon class="ml-auto size-3.5" aria-hidden="true" />
{/if}
