<script lang="ts">
  import { StatusIcon } from '@/lib/components/ui-icons';
  import { INITIATIVE_STATUS_LABEL, type InitiativeStatus } from '@/lib/initiative-model';

  const GLYPH = {
    planned: 'unstarted',
    active: 'started',
    completed: 'completed',
  } as const;

  let { status }: { status: InitiativeStatus } = $props();
</script>

<StatusIcon
  type={GLYPH[status]}
  color={status === 'completed' ? '#5e6ad2' : undefined}
  size={14}
  aria-label={INITIATIVE_STATUS_LABEL[status]}
/>
