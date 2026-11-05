<!-- "Add link" form of SectionAttachments (React's local LinkForm). -->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { parseLinkUrl } from '@/lib/components/issue-hierarchy/attachment-utils';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';

  let { onSubmit }: { onSubmit: (url: string, title: string) => Promise<boolean> } = $props();

  let url = $state('');
  let title = $state('');
  let busy = $state(false);
  let invalid = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const parsed = parseLinkUrl(url);
    if (!parsed) {
      invalid = true;
      return;
    }
    busy = true;
    const done = await onSubmit(parsed, title.trim());
    busy = false;
    if (done) {
      url = '';
      title = '';
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-2">
  <!-- svelte-ignore a11y_autofocus -->
  <Input
    autofocus
    type="url"
    aria-label="Link URL"
    placeholder="https://…"
    bind:value={url}
    aria-invalid={invalid || undefined}
    oninput={() => (invalid = false)}
    class="h-7"
  />
  <Input aria-label="Link title" placeholder="Title (optional)" bind:value={title} maxlength={255} class="h-7" />
  {#if invalid}<p class="text-xs text-destructive">Enter an http(s) URL.</p>{/if}
  <Button type="submit" size="sm" class="self-end" disabled={busy || !url.trim()}>
    {#if busy}<Loader2Icon class="animate-spin" />{/if}
    Add link
  </Button>
</form>
