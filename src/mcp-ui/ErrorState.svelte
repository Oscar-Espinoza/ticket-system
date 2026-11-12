<script lang="ts">
  import Icon from './Icon.svelte';

  let { message, title = 'Something went wrong' }: { message: string; title?: string } = $props();
</script>

<div role="alert" class="flex items-start gap-2.5 rounded-view border border-danger/40 bg-dangerbg p-3 text-danger">
  <Icon name="alert" size={16} />
  <div class="min-w-0">
    <p class="font-semibold">{title}</p>
    {#if message}
      <p class="mt-0.5 text-fg whitespace-pre-line [overflow-wrap:anywhere]">{message}</p>
    {/if}
  </div>
</div>
