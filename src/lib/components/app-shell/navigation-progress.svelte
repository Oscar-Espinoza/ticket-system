<!--
  Thin progress bar at the top of the viewport while a navigation runs for more
  than 150 ms (the dashboard's single navigation indicator; the per-route
  loading.tsx skeletons are dashboard-loading / project-loading).
-->
<script lang="ts">
  let { active }: { active: boolean } = $props();
</script>

{#if active}
  <div
    role="progressbar"
    aria-label="Loading page"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15"
  >
    <div class="nav-progress-bar h-full w-1/3 bg-primary"></div>
  </div>
{/if}

<style>
  .nav-progress-bar {
    animation: nav-progress 1.1s ease-in-out infinite;
  }
  @keyframes nav-progress {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(300%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nav-progress-bar {
      animation: none;
      width: 100%;
      opacity: 0.6;
    }
  }
</style>
