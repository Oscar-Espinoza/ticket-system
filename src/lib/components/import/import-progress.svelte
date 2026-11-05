<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { Progress } from '@/lib/components/ui/progress';

  let { done, total }: { done: number; total: number } = $props();
</script>

<div class="flex flex-col gap-2" aria-live="polite">
  <div class="flex items-center gap-2 text-sm">
    <Loader2Icon class="size-4 animate-spin text-muted-foreground" />
    Importing {done} of {total}…
  </div>
  <Progress value={(done / total) * 100} aria-label="Import progress" />
</div>
