<script lang="ts">
  import { StatusIcon } from '@/lib/components/ui-icons';
  import {
    EPIC_STATUS_GLYPH,
    EPIC_STATUS_LABEL,
    type EpicStatus,
  } from '@/components/epics/epic-model';

  let { status, size = 14 }: { status: EpicStatus; size?: 14 | 16 } = $props();

  const glyph = $derived(EPIC_STATUS_GLYPH[status]);
</script>

<StatusIcon
  type={glyph.type}
  color={glyph.color}
  {size}
  percent={status === 'paused' ? 50 : 60}
  aria-label={EPIC_STATUS_LABEL[status]}
/>
