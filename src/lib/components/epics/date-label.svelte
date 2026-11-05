<script lang="ts">
  import { formatDueDate } from '@/lib/dates';

  let { value, placeholder }: { value: string | null; placeholder: string } = $props();
</script>

{#if value}
  <span>{formatDueDate(value)}</span>
{:else}
  <span class="text-muted-foreground">{placeholder}</span>
{/if}
