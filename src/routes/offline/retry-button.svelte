<!-- Port of src/app/offline/retry-button.tsx. -->
<script lang="ts">
  import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

  import { Button } from '@/lib/components/ui/button';
</script>

<Button variant="outline" size="sm" class="mt-2" onclick={() => window.location.reload()}>
  <RotateCwIcon />
  Try again
</Button>
