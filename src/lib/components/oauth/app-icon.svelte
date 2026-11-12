<!--
  Square app logo with a letter fallback.
  Logo URLs are third-party; a broken image falls back instead of showing an
  empty box.
-->
<script lang="ts">
  import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from '@/lib/components/ui/avatar';
  import { safeHref } from '@/lib/oauth-model';
  import { cn } from '@/lib/utils';

  let {
    name,
    src,
    size = 'default',
    class: className,
  }: {
    name: string;
    src: string | null;
    size?: 'default' | 'lg';
    class?: string;
  } = $props();

  const square = 'rounded-md after:rounded-md';
  // Client-supplied: only http(s) images.
  const image = $derived(safeHref(src));
</script>

<AvatarRoot {size} class={cn(square, size === 'lg' && 'size-12', className)}>
  {#if image}<AvatarImage src={image} alt="" class="rounded-md" />{/if}
  <AvatarFallback class={cn('rounded-md font-medium', size === 'lg' && 'text-lg')}>
    {name.trim().charAt(0).toUpperCase() || '?'}
  </AvatarFallback>
</AvatarRoot>
