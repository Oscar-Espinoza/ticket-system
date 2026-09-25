'use client';

// Sidebar "Favorites" section. Removing unstars optimistically; the action
// revalidates the dashboard layout, which re-renders this list from the server.

import { useOptimistic, useTransition } from 'react';
import { Box, FolderKanban, Layers, RefreshCcw, Target, X } from 'lucide-react';
import { toast } from 'sonner';

import { toggleFavorite } from '@/app/actions/favorites';
import { SidebarLink, SidebarSection } from '@/components/app-shell/sidebar-nav';
import { StatusIcon } from '@/components/ui-icons';
import type { FavoriteTarget } from '@/lib/favorite-targets';
import type { SidebarFavorite } from '@/lib/favorites';

const TYPE_ICON: Record<FavoriteTarget, React.ReactNode> = {
  project: <FolderKanban />,
  issue: null,
  view: <Layers />,
  epic: <Box />,
  cycle: <RefreshCcw />,
  initiative: <Target />,
};

function icon(item: SidebarFavorite) {
  if (item.state) {
    return <StatusIcon type={item.state.type} color={item.state.color} aria-label={item.state.name} size={14} />;
  }
  return TYPE_ICON[item.targetType];
}

export function SidebarFavoritesList({ items }: { items: SidebarFavorite[] }) {
  const [shown, removeOptimistic] = useOptimistic(items, (list, id: string) =>
    list.filter((item) => item.id !== id),
  );
  const [, startTransition] = useTransition();

  const remove = (item: SidebarFavorite) => {
    startTransition(async () => {
      removeOptimistic(item.id);
      const result = await toggleFavorite({ targetType: item.targetType, targetId: item.targetId });
      if (!result.ok) toast.error(result.error);
      // Already removed elsewhere, so the toggle re-added it — undo that.
      else if (result.favorited) await toggleFavorite({ targetType: item.targetType, targetId: item.targetId });
    });
  };

  if (shown.length === 0) return null;
  return (
    <SidebarSection title="Favorites">
      {shown.map((item) => (
        <div key={item.id} className="group/fav relative">
          <SidebarLink href={item.href} label={item.label} icon={icon(item)} />
          <button
            type="button"
            aria-label={`Remove ${item.label} from favorites`}
            title="Remove from favorites"
            onClick={() => remove(item)}
            className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/fav:opacity-100 [&_svg]:size-3.5"
          >
            <X />
          </button>
        </div>
      ))}
    </SidebarSection>
  );
}
