<!-- Create a dashboard (name, scope, description) or rename an existing one. -->
<script lang="ts">
  import { Dialog, DialogContent } from '@/lib/components/ui/dialog';
  import DashboardDetailsForm from './dashboard-details-form.svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    dashboard,
    projects = [],
    defaultProjectId = null,
    onSaved,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Edit mode; omit to create. */
    dashboard?: { id: string; name: string; description: string | null };
    /** Create mode: scopes to choose from. */
    projects?: { id: string; name: string }[];
    defaultProjectId?: string | null;
    onSaved?: () => void;
  } = $props();
</script>

<Dialog bind:open {onOpenChange}>
  <DialogContent class="sm:max-w-md">
    {#if open}
      <DashboardDetailsForm
        {dashboard}
        {projects}
        {defaultProjectId}
        onDone={() => {
          open = false;
          onOpenChange?.(false);
          onSaved?.();
        }}
      />
    {/if}
  </DialogContent>
</Dialog>
