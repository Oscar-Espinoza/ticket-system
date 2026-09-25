'use client';

// Who else is editing (awareness), as a small overlapped avatar stack ringed in
// each person's caret color, plus a quiet sync status when it isn't "all good".

import { CloudOff, Loader2 } from 'lucide-react';

import { Avatar } from '@/components/ui-icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CollabSnapshot } from '@/lib/collab/provider';
import { cn } from '@/lib/utils';
import type { CollabPeer } from './use-collab';

const MAX = 4;

function names(list: string[]): string {
  if (list.length <= 2) return list.join(' and ');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

export function CollabAvatars({ peers, className }: { peers: CollabPeer[]; className?: string }) {
  if (peers.length === 0) return null;
  const label = `${names(peers.map((p) => p.name))} ${peers.length === 1 ? 'is' : 'are'} editing`;
  const extra = peers.length - MAX;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="img"
          tabIndex={0}
          aria-label={label}
          className={cn('flex items-center -space-x-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50', className)}
        >
          {peers.slice(0, MAX).map((peer) => (
            <span key={peer.id} className="rounded-full ring-2" style={{ ['--tw-ring-color' as string]: peer.color }}>
              <Avatar name={peer.name} src={peer.image} size={20} />
            </span>
          ))}
          {extra > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
              +{extra}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Nothing while synced; otherwise a quiet "Connecting…" / "Offline" note. */
export function CollabStatusBadge({ snapshot, className }: { snapshot: CollabSnapshot; className?: string }) {
  if (snapshot.status === 'synced') return null;
  const text =
    snapshot.status === 'connecting'
      ? 'Connecting…'
      : snapshot.status === 'offline'
        ? 'Offline — changes will sync'
        : 'Live editing unavailable';
  return (
    <span
      role="status"
      className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}
      title={snapshot.status === 'offline' ? 'Your changes are kept and sync when the connection is back.' : undefined}
    >
      {snapshot.status === 'connecting' ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <CloudOff className="size-3.5" aria-hidden />
      )}
      {text}
    </span>
  );
}
