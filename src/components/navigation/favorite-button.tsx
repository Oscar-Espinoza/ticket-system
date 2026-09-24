'use client';

// Star toggle for anything favoritable. Pass `initial` when the server already
// knows the state; otherwise it's looked up once on mount.

import { useEffect, useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { isFavorited, toggleFavorite } from '@/app/actions/favorites';
import type { FavoriteTarget } from '@/lib/favorite-targets';
import { cn } from '@/lib/utils';

export function FavoriteButton({
  targetType,
  targetId,
  initial,
  className,
}: {
  targetType: FavoriteTarget;
  targetId: string;
  initial?: boolean;
  className?: string;
}) {
  const [favorited, setFavorited] = useState(initial ?? false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (initial !== undefined) return;
    let active = true;
    isFavorited(targetType, targetId).then((value) => {
      if (active) setFavorited(value);
    });
    return () => {
      active = false;
    };
  }, [initial, targetType, targetId]);

  const toggle = () => {
    const optimistic = !favorited;
    setFavorited(optimistic);
    startTransition(async () => {
      const result = await toggleFavorite({ targetType, targetId });
      if (!result.ok) {
        setFavorited(!optimistic);
        toast.error(result.error);
      } else {
        setFavorited(result.favorited);
      }
    });
  };

  const label = favorited ? 'Remove from favorites' : 'Add to favorites';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={favorited}
      title={label}
      disabled={pending}
      onClick={toggle}
      className={className}
    >
      <Star className={cn(favorited && 'fill-amber-400 text-amber-400')} />
    </Button>
  );
}
