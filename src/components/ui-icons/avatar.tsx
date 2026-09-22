// Avatar — C4 primitive (M4 scope item 1; composed by M5–M7). Wraps the
// shadcn/radix avatar primitives from ui/avatar: GitHub image when present,
// deterministic initials fallback otherwise (same-name → same-letters, no
// random hue — C1 neutrals only). Sizes are the C4 contract: 20 or 24 px.
//
// Note: user-menu.tsx keeps its own inline avatar logic (M3-owned file) —
// deduplicating it against this primitive is explicitly out of M4 scope.

import { cn } from '@/lib/utils';
import {
  Avatar as AvatarRoot,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

export interface AvatarProps {
  /** Display name — source of the deterministic initials. */
  name?: string | null;
  /** GitHub image URL; falls back to initials when absent or failing. */
  src?: string | null;
  /** 20 or 24 px (C4 contract). */
  size?: 20 | 24;
  className?: string;
}

function initialsOf(name?: string | null): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export function Avatar({ name, src, size = 24, className }: AvatarProps) {
  return (
    <AvatarRoot
      // 24px = the sm primitive (size-6); 20px overrides the default size-8.
      size={size === 24 ? 'sm' : 'default'}
      className={cn(size === 20 && 'size-5', className)}
    >
      {src && <AvatarImage src={src} alt={name ?? ''} />}
      <AvatarFallback className={size === 20 ? 'text-xs' : undefined}>
        {initialsOf(name)}
      </AvatarFallback>
    </AvatarRoot>
  );
}
