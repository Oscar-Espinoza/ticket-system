<!--
  Edit one widget: title, type, project, filters (query syntax everywhere; the
  Filter menu + chips when a single project is in scope), type options, size.
-->
<script lang="ts">
  import { Dialog, DialogContent } from '@/lib/components/ui/dialog';
  import type { DashboardDataset, Widget } from '@/components/dashboards/widget-model';
  import WidgetEditorForm from './widget-editor-form.svelte';

  let {
    widget,
    dataset,
    scopeProjectId,
    onOpenChange,
    onSave,
  }: {
    /** Open while non-null. */
    widget: Widget | null;
    dataset: DashboardDataset;
    /** The dashboard's project (null = cross-project dashboard). */
    scopeProjectId: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (widget: Widget) => void;
  } = $props();
</script>

<Dialog open={widget !== null} {onOpenChange}>
  <DialogContent class="sm:max-w-lg">
    {#if widget}
      {#key widget.id}
        <WidgetEditorForm
          initial={widget}
          {dataset}
          {scopeProjectId}
          onCancel={() => onOpenChange(false)}
          {onSave}
        />
      {/key}
    {/if}
  </DialogContent>
</Dialog>
