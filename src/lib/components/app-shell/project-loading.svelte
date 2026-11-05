<!-- Project issues skeleton (port of src/app/dashboard/projects/[id]/loading.tsx).
     The project header and tabs live in the layout, so only the issues body loads here. -->
<script lang="ts">
  import { Skeleton } from '@/lib/components/ui-icons';
</script>

<div role="status" aria-label="Loading issues">
  <span class="sr-only">Loading issues…</span>
  <div class="mb-3 flex items-center gap-2">
    <Skeleton class="h-7 w-24" />
    <Skeleton class="h-7 w-36" />
    <Skeleton class="ml-auto h-7 w-24" />
  </div>
  <div class="flex flex-col gap-1">
    {#each { length: 8 }, i (i)}
      <Skeleton />
    {/each}
  </div>
</div>
