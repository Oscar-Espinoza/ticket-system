<!-- The ⋯ menu on an owned widget card (edit, size, move, duplicate, remove). -->
<script lang="ts">
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';

  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { WIDGET_SIZES, sizeOf, type Widget } from '@/lib/widget-model';

  let {
    widget,
    first,
    last,
    onEdit,
    onResize,
    onMove,
    onDuplicate,
    onRemove,
  }: {
    widget: Widget;
    first: boolean;
    last: boolean;
    onEdit: () => void;
    onResize: (size: string) => void;
    onMove: (delta: number) => void;
    onDuplicate: () => void;
    onRemove: () => void;
  } = $props();
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon-xs"
        aria-label={`Actions for ${widget.title}`}
        class="opacity-0 group-hover/widget:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      >
        <MoreHorizontalIcon />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={onEdit}>
      <PencilIcon />
      Edit…
    </DropdownMenuItem>
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Maximize2Icon />
        Size
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuLabel class="text-xs text-muted-foreground">Size</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sizeOf(widget)} onValueChange={onResize}>
          {#each WIDGET_SIZES as size (size.id)}
            <DropdownMenuRadioItem value={size.id}>{size.label}</DropdownMenuRadioItem>
          {/each}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
      <ArrowLeftIcon />
      Move earlier
    </DropdownMenuItem>
    <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
      <ArrowRightIcon />
      Move later
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={onDuplicate}>
      <CopyIcon />
      Duplicate
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive" onSelect={onRemove}>
      <Trash2Icon />
      Remove
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
