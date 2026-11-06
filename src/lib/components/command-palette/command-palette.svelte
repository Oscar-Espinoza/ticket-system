<!-- ⌘K command palette: built-in commands (props) + registered extensions. -->
<script lang="ts">
  import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import { paletteCommands, type PaletteCommand } from '@/lib/svelte/palette-commands.svelte';

  let {
    open,
    onOpenChange,
    commands: builtIns,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    commands: PaletteCommand[];
  } = $props();

  const grouped = $derived.by(() => {
    const all = [...builtIns, ...paletteCommands.current];
    // Group by section, preserving first-appearance order.
    const order: string[] = [];
    const bySection = new Map<string, PaletteCommand[]>();
    for (const command of all) {
      const section = command.section ?? 'General';
      if (!bySection.has(section)) {
        bySection.set(section, []);
        order.push(section);
      }
      bySection.get(section)!.push(command);
    }
    return order.map((section) => ({ section, commands: bySection.get(section)! }));
  });
</script>

<CommandDialog {open} {onOpenChange} title="Command palette" description="Search projects and actions.">
  <!-- radix-nova's CommandDialog does NOT wrap children in <Command>
       (unlike classic shadcn) — the root must be provided here -->
  <Command>
    <CommandInput placeholder="Search or jump to…" />
    <CommandEmpty>No results.</CommandEmpty>
    <CommandList>
      {#each grouped as group (group.section)}
        <CommandGroup heading={group.section}>
          {#each group.commands as command (command.id)}
            <CommandItem
              value={`${group.section}:${command.label}:${command.keywords?.join(' ') ?? ''}`}
              onSelect={() => {
                command.run();
                onOpenChange(false);
              }}
            >
              {command.label}
            </CommandItem>
          {/each}
        </CommandGroup>
      {/each}
    </CommandList>
  </Command>
</CommandDialog>
