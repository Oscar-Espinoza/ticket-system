<!-- Create / edit a customer. The form remounts per open so it starts from the current values. -->
<script lang="ts">
  import type { CustomerRow } from '@/components/customers/customer-model';
  import { Dialog, DialogContent } from '@/lib/components/ui/dialog';
  import CustomerForm from './customer-form.svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    customer,
    tiers = [],
    openAfterCreate = false,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Edit this customer; create when absent. */
    customer?: CustomerRow;
    /** Tier suggestions (tiers already in use). */
    tiers?: string[];
    openAfterCreate?: boolean;
  } = $props();

  function setOpen(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-lg">
    {#if open}
      <CustomerForm {customer} {tiers} {openAfterCreate} onDone={() => setOpen(false)} />
    {/if}
  </DialogContent>
</Dialog>
