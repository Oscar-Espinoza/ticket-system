<!--
  Placeholder body for routes whose feature lands in a later wave. Owners
  replace the whole page; nothing should import this once all routes ship.
  Port of src/components/coming-soon.tsx.
-->
<script lang="ts">
  import HammerIcon from '@lucide/svelte/icons/hammer';

  import { EmptyState } from '@/lib/components/ui-icons';

  let { title, description = 'This page is being built.' }: { title: string; description?: string } = $props();
</script>

<div class="flex flex-col">
  <h1 class="mb-2 text-xl font-medium">{title}</h1>
  <EmptyState title="Coming soon" {description}>
    {#snippet icon()}<HammerIcon />{/snippet}
  </EmptyState>
</div>
