<!-- Project issues skeleton.
     The project header and tabs live in the layout, so only the issues body loads here. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { Skeleton } from '@/lib/components/ui-icons';
</script>

<div role="status" aria-label={m.editor_loading_issues()}>
  <span class="sr-only">{m.editor_loading_issues_sr()}</span>
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
