<!--
  The token step of the API importers (Asana, Shortcut). The token lives in
  component state only — it's sent with each server call and never stored.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';

  let {
    provider,
    help,
    pending,
    onSubmit,
  }: {
    provider: string;
    help: Snippet;
    pending: boolean;
    onSubmit: (token: string) => void;
  } = $props();

  const id = $props.id();
  let token = $state('');
</script>

<form
  class="flex flex-col gap-3"
  onsubmit={(event) => {
    event.preventDefault();
    if (token.trim()) onSubmit(token.trim());
  }}
>
  <div class="flex flex-wrap items-end gap-3">
    <div class="flex min-w-64 flex-1 flex-col gap-1.5">
      <Label for={id}>{provider} personal access token</Label>
      <Input {id} type="password" autocomplete="off" bind:value={token} disabled={pending} />
    </div>
    <Button type="submit" variant="outline" disabled={pending || !token.trim()}>
      {#if pending}<Loader2Icon class="animate-spin" />{:else}<KeyRoundIcon />{/if}
      Continue
    </Button>
  </div>
  <p class="text-xs text-muted-foreground">
    {@render help()} The token is only used for this import and isn&apos;t saved.
  </p>
</form>
