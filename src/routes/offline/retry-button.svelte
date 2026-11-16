<script lang="ts">
  import { m } from '@/lib/i18n';
  import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

  import { Button } from '@/lib/components/ui/button';
</script>

<Button variant="outline" size="sm" class="mt-2" onclick={() => window.location.reload()}>
  <RotateCwIcon />
  {m.common_retry()}
</Button>
