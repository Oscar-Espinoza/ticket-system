<!--
  "New workspace" dialog: name → URL slug (derived until edited). Opens the
  new workspace on success. CreateWorkspaceTrigger (create-workspace-trigger.svelte)
  is the sidebar entry point that also registers the palette command.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { slugify } from '@/components/workspaces/slug';
  import { createWorkspace } from '@/lib/actions/workspaces';
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

  let {
    open = $bindable(false),
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  } = $props();

  const uid = $props.id();
  let name = $state('');
  let slug = $state('');
  let slugEdited = $state(false);
  let errors = $state<{ name?: string; slug?: string; server?: string }>({});
  let isPending = $state(false);
  const effectiveSlug = $derived(slugEdited ? slug : slugify(name));

  function reset() {
    name = '';
    slug = '';
    slugEdited = false;
    errors = {};
  }

  function setOpen(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    isPending = true;
    try {
      const result = await createWorkspace({ name, slug: effectiveSlug });
      if (!result) return;
      if (!result.ok) {
        const field = result.field === 'name' || result.field === 'slug' ? result.field : 'server';
        errors = { [field]: result.error };
        return;
      }
      toast.success('Workspace created');
      setOpen(false);
      reset();
      void goto(`/dashboard/workspaces/${result.slug}`);
    } finally {
      isPending = false;
    }
  }
</script>

<Dialog
  bind:open={() => open, (next) => {
    setOpen(next);
    if (!next) reset();
  }}
>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Create workspace</DialogTitle>
      <DialogDescription>Group related projects (teams) and plan initiatives across them.</DialogDescription>
    </DialogHeader>
    <form onsubmit={submit} class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="{uid}-name">Name</Label>
        <Input
          id="{uid}-name"
          autofocus
          bind:value={() => name, (v) => {
            name = v;
            errors = {};
          }}
          maxlength={60}
          placeholder="Acme Inc."
          aria-invalid={errors.name ? true : undefined}
        />
        {#if errors.name}<p class="text-sm text-destructive">{errors.name}</p>{/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="{uid}-slug">URL</Label>
        <div class="flex items-center gap-1 text-sm text-muted-foreground">
          <span class="shrink-0">/workspaces/</span>
          <Input
            id="{uid}-slug"
            bind:value={() => effectiveSlug, (v: string) => {
              slugEdited = true;
              slug = v.toLowerCase().replace(/[^a-z0-9-]/g, '');
              errors = {};
            }}
            maxlength={40}
            placeholder="acme"
            aria-invalid={errors.slug ? true : undefined}
            class="font-mono"
          />
        </div>
        {#if errors.slug}<p class="text-sm text-destructive">{errors.slug}</p>{/if}
      </div>
      {#if errors.server}<p class="text-sm text-destructive">{errors.server}</p>{/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {#if isPending}<LoaderCircleIcon class="animate-spin" />{/if}
          Create workspace
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
