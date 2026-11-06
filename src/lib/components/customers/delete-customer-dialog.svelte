<!-- Admin-only delete confirmation. Open while `customer` is set. -->
<script lang="ts">
  import { toast } from 'svelte-sonner';

  import type { CustomerRow } from '@/lib/customer-model';
  import { deleteCustomer } from '@/lib/actions/customers';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';

  let {
    customer,
    onOpenChange,
    onDeleted,
  }: {
    /** Open while set. */
    customer: Pick<CustomerRow, 'id' | 'name'> | null;
    onOpenChange: (open: boolean) => void;
    onDeleted?: () => void;
  } = $props();

  const data = useProjectData();
  let pending = $state(false);

  async function remove() {
    if (!customer || pending) return;
    const target = customer;
    pending = true;
    try {
      const result = await deleteCustomer({ projectId: data.project.id, id: target.id });
      if (!result) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${target.name}`);
      onOpenChange(false);
      onDeleted?.();
    } finally {
      pending = false;
    }
  }
</script>

<!-- Strictly controlled: open exactly while `customer` is set. -->
<AlertDialog bind:open={() => customer !== null, (next) => onOpenChange(next)}>
  <AlertDialogContent size="sm">
    <AlertDialogHeader>
      <AlertDialogTitle>Delete {customer?.name}?</AlertDialogTitle>
      <AlertDialogDescription>
        The customer is removed permanently. Their requests stay on the issues, without a customer.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        variant="destructive"
        disabled={pending}
        onclick={(event) => {
          event.preventDefault();
          void remove();
        }}
      >
        Delete customer
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
