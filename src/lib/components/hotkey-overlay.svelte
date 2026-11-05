<!-- `?` overlay: the shortcuts currently registered in this session.
     Port of src/components/hotkey-overlay.tsx. -->
<script lang="ts">
  import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { formatHotkey, registeredHotkeys, type Hotkey } from '@/lib/svelte/hotkeys.svelte';

  let { open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void } = $props();

  const groups = $derived.by(() => {
    const order: string[] = [];
    const byScope = new Map<string, Hotkey[]>();
    // The same shortcut can be registered by two mounted instances (list + pane).
    const seen = new Set<string>();
    for (const hotkey of registeredHotkeys.current) {
      const scope = hotkey.scope ?? 'Global';
      const id = `${scope}\u0000${formatHotkey(hotkey)}\u0000${hotkey.description}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (!byScope.has(scope)) {
        byScope.set(scope, []);
        order.push(scope);
      }
      byScope.get(scope)!.push(hotkey);
    }
    return order.map((scope) => ({ scope, hotkeys: byScope.get(scope)! }));
  });
</script>

<Dialog {open} {onOpenChange}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogDescription>Shortcuts currently registered in this session.</DialogDescription>
    </DialogHeader>

    <div data-hotkey-overlay class="flex flex-col gap-4">
      {#each groups as group (group.scope)}
        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">
            {group.scope}
          </p>
          <ul class="flex flex-col gap-1.5">
            {#each group.hotkeys as hotkey (`${formatHotkey(hotkey)}-${hotkey.description}`)}
              <li class="flex items-center justify-between gap-4 text-sm">
                <span class="text-foreground">{hotkey.description}</span>
                <kbd
                  class="pointer-events-none inline-flex h-5 shrink-0 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
                >
                  {formatHotkey(hotkey)}
                </kbd>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </DialogContent>
</Dialog>
