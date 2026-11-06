<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createLabel, updateLabel, type LabelActionResult } from '@/lib/actions/labels';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { LABEL_DESCRIPTION_MAX, LABEL_NAME_MAX } from '@/lib/label-model';
  import type { ProjectLabel } from '@/lib/project-data-types';
  import ColorPicker, { PRESET_COLORS } from '../workflow/color-picker.svelte';

  let {
    projectId,
    label,
    onDone,
  }: {
    projectId: string;
    /** Absent = creating a new label. */
    label?: ProjectLabel;
    onDone: () => void;
  } = $props();

  let name = $state(untrack(() => label?.name ?? ''));
  let color = $state(
    untrack(
      () => label?.color ?? PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
    ),
  );
  let description = $state(untrack(() => label?.description ?? ''));
  let error = $state<Extract<LabelActionResult, { ok: false }> | null>(null);
  let isPending = $state(false);
  const focusOnMount = (node: HTMLElement) => node.focus();

  async function save(event: SubmitEvent) {
    event.preventDefault();
    isPending = true;
    try {
      const result = label
        ? await updateLabel({ projectId, id: label.id, name, color, description })
        : await createLabel({ projectId, name, color, description });
      if (!result.ok) {
        error = result;
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(label ? 'Label updated' : `Created “${name.trim()}”`);
      onDone();
    } finally {
      isPending = false;
    }
  }
</script>

<li class="px-3 py-2">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    onsubmit={save}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      }
    }}
    class="flex flex-col gap-2 sm:flex-row sm:items-center"
  >
    <div class="flex flex-1 items-center gap-2">
      <ColorPicker value={color} onChange={(next) => (color = next)} label="Label color" />
      <!-- Svelte's autofocus only works when nothing has focus; focus on mount instead. -->
      <Input
        {@attach focusOnMount}
        bind:value={name}
        oninput={() => {
          if (error) error = null;
        }}
        placeholder="Label name"
        maxlength={LABEL_NAME_MAX}
        aria-label="Label name"
        aria-invalid={error?.field === 'name' ? true : undefined}
        class="h-7 w-40"
      />
      <Input
        bind:value={description}
        placeholder="Description (optional)"
        maxlength={LABEL_DESCRIPTION_MAX}
        aria-label="Description"
        class="h-7 min-w-0 flex-1"
      />
    </div>
    <div class="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onclick={onDone}>Cancel</Button>
      <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
        {#if isPending}<Loader2Icon class="animate-spin" />{/if}
        {label ? 'Save' : 'Create label'}
      </Button>
    </div>
  </form>
  {#if error?.field}
    <p role="alert" class="mt-1.5 text-xs text-destructive">
      {error.error}
    </p>
  {/if}
</li>
