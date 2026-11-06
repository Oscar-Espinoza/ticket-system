<!-- Name a new API key. Mounted while open. -->
<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createApiKey, type ApiKeyView } from '@/lib/actions/api-keys';
  import Field from '@/lib/components/settings/field.svelte';
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

  let {
    onClose,
    onCreated,
  }: {
    onClose: () => void;
    onCreated: (apiKey: ApiKeyView, key: string) => void;
  } = $props();

  let name = $state('');
  let error = $state<string>();
  let pending = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    pending = true;
    try {
      const result = await createApiKey({ name });
      if (!result) return;
      if (result.ok) onCreated(result.apiKey, result.key);
      else if (result.field) error = result.error;
      else toast.error(result.error);
    } finally {
      pending = false;
    }
  }
</script>

<Dialog
  bind:open={() => true, (open) => {
    if (!open) onClose();
  }}
>
  <DialogContent>
    <form onsubmit={submit} novalidate class="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Create API key</DialogTitle>
        <DialogDescription>The key acts as you, with your project roles.</DialogDescription>
      </DialogHeader>
      <Field id="api-key-name" label="Name" hint="Where it’s used, e.g. “CI bot”." {error}>
        <Input
          id="api-key-name"
          bind:value={() => name, (v) => {
            name = v;
            error = undefined;
          }}
          maxlength={60}
          autofocus
          autocomplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? 'api-key-name-error' : undefined}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
          Create key
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
