<script lang="ts">
  let { label, value, hint }: { label: string; value: string | number; hint?: string } = $props();
</script>

<div class="flex flex-col gap-1 rounded-lg border border-border px-4 py-3">
  <span class="text-xs text-muted-foreground">{label}</span>
  <span class="text-2xl font-medium tabular-nums">{value}</span>
  {#if hint}<span class="text-xs text-muted-foreground">{hint}</span>{/if}
</div>
