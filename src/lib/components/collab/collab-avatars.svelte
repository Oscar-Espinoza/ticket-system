<!--
  Who else is editing (awareness), as a small overlapped avatar stack ringed in
  each person's caret color (port of CollabAvatars in
  src/components/collab/collab-avatars.tsx; CollabStatusBadge is
  ./collab-status-badge.svelte).
-->
<script lang="ts">
  import { Avatar } from '@/lib/components/ui-icons';
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import { cn } from '@/lib/utils';
  import type { CollabPeer } from './use-collab.svelte';

  const MAX = 4;

  function names(list: string[]): string {
    if (list.length <= 2) return list.join(' and ');
    return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  }

  let { peers, class: className }: { peers: CollabPeer[]; class?: string } = $props();

  const label = $derived(`${names(peers.map((p) => p.name))} ${peers.length === 1 ? 'is' : 'are'} editing`);
  const extra = $derived(peers.length - MAX);
</script>

{#if peers.length > 0}
  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        <div
          {...props}
          role="img"
          tabindex={0}
          aria-label={label}
          class={cn(
            'flex items-center -space-x-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            className,
          )}
        >
          {#each peers.slice(0, MAX) as peer (peer.id)}
            <span class="rounded-full ring-2" style:--tw-ring-color={peer.color}>
              <Avatar name={peer.name} src={peer.image} size={20} />
            </span>
          {/each}
          {#if extra > 0}
            <span
              class="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background"
            >
              +{extra}
            </span>
          {/if}
        </div>
      {/snippet}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
{/if}
