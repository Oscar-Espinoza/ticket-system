<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { Progress } from '@/lib/components/ui/progress';

  let { done, total }: { done: number; total: number } = $props();
</script>

<div class="flex flex-col gap-2" aria-live="polite">
  <div class="flex items-center gap-2 text-sm">
    <Loader2Icon class="size-4 animate-spin text-muted-foreground" />
    {m.auth_import_progress({ done, total })}
  </div>
  <Progress value={(done / total) * 100} aria-label={m.auth_import_progress_label()} />
</div>
