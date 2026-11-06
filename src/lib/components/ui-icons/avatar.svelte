<script module lang="ts">
  export interface AvatarProps {
    /** Display name — source of the deterministic initials. */
    name?: string | null;
    /** GitHub image URL; falls back to initials when absent or failing. */
    src?: string | null;
    /** 20 or 24 px. */
    size?: 20 | 24;
    class?: string;
  }

  function initialsOf(name?: string | null): string {
    const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (words.length === 0) return '?';
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return `${first}${last}`.toUpperCase();
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';
  import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from '@/lib/components/ui/avatar';

  let { name, src, size = 24, class: className }: AvatarProps = $props();
</script>

<!-- 24px = the sm primitive (size-6); 20px overrides the default size-8. -->
<AvatarRoot size={size === 24 ? 'sm' : 'default'} class={cn(size === 20 && 'size-5', className)}>
  {#if src}
    <AvatarImage {src} alt={name ?? ''} />
  {/if}
  <AvatarFallback class={size === 20 ? 'text-xs' : undefined}>
    {initialsOf(name)}
  </AvatarFallback>
</AvatarRoot>
