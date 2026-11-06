// Non-component customer glyph exports. The
// glyph components themselves are customer-logo.svelte, customer-status-chip.svelte,
// importance-icon.svelte and request-source-icon.svelte (one file per export).

import type { CustomerStatus } from '@/lib/customer-model';

export const STATUS_DOT_CLASS: Record<CustomerStatus, string> = {
  active: 'bg-status-done',
  lead: 'bg-status-in-progress',
  churned: 'bg-muted-foreground',
};
