<!-- Name a new API key. Mounted while open. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
        <DialogTitle>{m.settings_int_create_key_title()}</DialogTitle>
        <DialogDescription>{m.settings_int_create_key_desc()}</DialogDescription>
      </DialogHeader>
      <Field id="api-key-name" label={m.common_name()} hint={m.settings_int_key_name_hint()} {error}>
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
        <Button type="button" variant="ghost" onclick={onClose}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
          {m.settings_int_create_key()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
