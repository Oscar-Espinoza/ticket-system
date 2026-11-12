<div class="space-y-3" role="status" aria-live="polite" aria-busy="true">
  <span class="sr-only-text">Loading…</span>
  <div class="skeleton h-5 w-2/5"></div>
  {#each [0, 1, 2, 3] as i (i)}
    <div class="flex items-start gap-2.5">
      <div class="skeleton mt-0.5 size-4 shrink-0 rounded-full"></div>
      <div class="min-w-0 flex-1 space-y-1.5">
        <div class="skeleton h-3.5" style:width="{82 - i * 9}%"></div>
        <div class="skeleton h-3 w-1/3"></div>
      </div>
      <div class="skeleton size-5 shrink-0 rounded-full"></div>
    </div>
  {/each}
</div>
