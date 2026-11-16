<!-- Dashboard home skeleton. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { Skeleton } from '@/lib/components/ui-icons';
</script>

<div class="mt-8" role="status" aria-label={m.editor_loading_dashboard()}>
  <span class="sr-only">{m.editor_loading_dashboard_sr()}</span>

  <!-- Greeting line (text-xl) + GitHub chip (h-5) -->
  <Skeleton class="h-6 w-56" />
  <Skeleton class="mt-3 h-5 w-44" />

  <!-- Section header + "New project" CTA row -->
  <div class="mb-4 mt-8 flex items-center justify-between">
    <Skeleton class="h-5 w-24" />
    <Skeleton class="h-8 w-28" />
  </div>

  <!-- Project rows — flush, one Skeleton per potential row -->
  <div class="flex flex-col">
    <Skeleton />
    <Skeleton />
    <Skeleton />
    <Skeleton />
  </div>
</div>
