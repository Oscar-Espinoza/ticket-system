<!--
  Name / describe / share a new saved view built from the current filters and
  display options, then open it. Remount ({#key}) per open to reset the form.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createView } from '@/lib/actions/views';
  import { m } from '@/lib/i18n';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { Textarea } from '@/lib/components/ui/textarea';

  let {
    open,
    onOpenChange,
    projectId,
    filters,
    display,
    canShare,
    defaultName = '',
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    filters: Record<string, unknown>;
    display: Record<string, unknown>;
    /** Members with write access may share views with the whole project. */
    canShare: boolean;
    defaultName?: string;
  } = $props();

  const uid = $props.id();
  // useState(defaultName): seeded once per mount.
  // svelte-ignore state_referenced_locally
  let name = $state(defaultName);
  let description = $state('');
  let shared = $state(false);
  let error = $state<string | null>(null);
  let pending = $state(false);

  async function submit() {
    if (!name.trim()) {
      error = m.editor_view_name_required();
      return;
    }
    pending = true;
    try {
      const result = await createView({
        projectId,
        name,
        description,
        shared: canShare && shared,
        filters,
        display,
      });
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success(m.editor_view_saved({ name: name.trim() }));
      onOpenChange(false);
      await goto(`/dashboard/projects/${result.projectId}/views/${result.id}`);
    } finally {
      pending = false;
    }
  }
</script>

<Dialog {open} {onOpenChange}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{m.editor_view_save_title()}</DialogTitle>
      <DialogDescription>{m.editor_view_save_desc()}</DialogDescription>
    </DialogHeader>
    <form
      class="flex flex-col gap-4"
      onsubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-name`}>{m.common_name()}</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id={`${uid}-name`}
          bind:value={() => name, (v) => {
            name = v ?? '';
            error = null;
          }}
          maxlength={80}
          autofocus
          placeholder={m.editor_view_name_placeholder()}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-description`}>
          {m.common_description()} <span class="font-normal text-muted-foreground">({m.common_optional().toLowerCase()})</span>
        </Label>
        <Textarea id={`${uid}-description`} bind:value={description} maxlength={500} rows={2} />
      </div>
      {#if canShare}
        <div class="flex items-center justify-between gap-4">
          <Label for={`${uid}-shared`} class="flex flex-col items-start gap-0.5">
            {m.editor_view_share()}
            <span class="text-xs font-normal text-muted-foreground">{m.editor_view_share_body()}</span>
          </Label>
          <Switch id={`${uid}-shared`} bind:checked={shared} />
        </div>
      {/if}
      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => onOpenChange(false)}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={pending}>
          {#if pending}<Loader2Icon class="animate-spin" />{/if}
          {m.editor_view_save_title()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
