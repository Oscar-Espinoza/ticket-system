<!-- "Add link" form of SectionAttachments. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { parseLinkUrl } from '@/lib/attachment-utils';
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
    aria-label={m.issues_attachment_link_url()}
    placeholder={'https://…'}
    bind:value={url}
    aria-invalid={invalid || undefined}
    oninput={() => (invalid = false)}
    class="h-7"
  />
  <Input aria-label={m.issues_attachment_link_title()} placeholder={m.issues_attachment_title_optional()} bind:value={title} maxlength={255} class="h-7" />
  {#if invalid}<p class="text-xs text-destructive">{m.issues_attachment_invalid_url()}</p>{/if}
  <Button type="submit" size="sm" class="self-end" disabled={busy || !url.trim()}>
    {#if busy}<Loader2Icon class="animate-spin" />{/if}
    {m.issues_attachment_add_link()}
  </Button>
</form>
