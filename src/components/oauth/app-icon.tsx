'use client';

// Square app logo with a letter fallback (logo URLs are third-party; a broken
// image falls back instead of showing an empty box).

import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function AppIcon({
  name,
  src,
  size = 'default',
  className,
}: {
  name: string;
  src: string | null;
  size?: 'default' | 'lg';
  className?: string;
}) {
  const square = 'rounded-md after:rounded-md';
  return (
    <AvatarRoot
      size={size}
      className={cn(square, size === 'lg' && 'size-12', className)}
    >
      {src && <AvatarImage src={src} alt="" className="rounded-md" />}
      <AvatarFallback className={cn('rounded-md font-medium', size === 'lg' && 'text-lg')}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </AvatarFallback>
    </AvatarRoot>
  );
}
