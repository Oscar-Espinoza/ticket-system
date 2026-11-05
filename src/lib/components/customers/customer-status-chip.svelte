<script lang="ts">
  import { LabelChip } from '@/lib/components/ui-icons';
  import { CUSTOMER_STATUS_LABEL, type CustomerStatus } from '@/lib/components/customers/customer-model';

  let { status, class: className }: { status: CustomerStatus; class?: string } = $props();

  const STATUS_COLOR = { active: 'done', lead: 'in_progress', churned: 'default' } as const;
</script>

<LabelChip color={STATUS_COLOR[status]} class={className}>
  {CUSTOMER_STATUS_LABEL[status]}
</LabelChip>
