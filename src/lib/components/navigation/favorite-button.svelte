<!--
  Star toggle for anything favoritable. Pass `initial` when the server already
  knows the state; otherwise it's looked up once on mount.
-->
<script lang="ts">
  import StarIcon from '@lucide/svelte/icons/star';
  import { toast } from 'svelte-sonner';

  import { isFavorited, toggleFavorite } from '@/lib/actions/favorites';
  import { Button } from '@/lib/components/ui/button';
  import type { FavoriteTarget } from '@/lib/favorite-targets';
  import { cn } from '@/lib/utils';

  let {
    targetType,
    targetId,
    initial,
    class: className,
  }: {
    targetType: FavoriteTarget;
    targetId: string;
    initial?: boolean;
    class?: string;
  } = $props();

  // useState(initial ?? false): seeded once.
  // svelte-ignore state_referenced_locally
  let favorited = $state(initial ?? false);
  let pending = $state(false);

  $effect(() => {
    if (initial !== undefined) return;
    let active = true;
    void isFavorited(targetType, targetId).then((value) => {
      if (active) favorited = value;
    });
    return () => {
      active = false;
    };
  });

  async function toggle() {
    const optimistic = !favorited;
    favorited = optimistic;
    pending = true;
    try {
      const result = await toggleFavorite({ targetType, targetId });
      if (!result.ok) {
        favorited = !optimistic;
        toast.error(result.error);
      } else {
        favorited = result.favorited;
      }
    } finally {
      pending = false;
    }
  }

  const label = $derived(favorited ? 'Remove from favorites' : 'Add to favorites');
</script>

<Button
  variant="ghost"
  size="icon-sm"
  aria-label={label}
  aria-pressed={favorited}
  title={label}
  disabled={pending}
  onclick={toggle}
  class={className}
>
  <StarIcon class={cn(favorited && 'fill-amber-400 text-amber-400')} />
</Button>
