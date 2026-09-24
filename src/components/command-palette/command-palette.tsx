'use client';

import { useSyncExternalStore } from 'react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  getPaletteCommands,
  subscribePaletteCommands,
  type PaletteCommand,
} from '@/lib/palette-commands';

export function CommandPalette({
  open,
  onOpenChange,
  commands: builtIns,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
}) {
  const extensions = useSyncExternalStore(
    subscribePaletteCommands,
    getPaletteCommands,
    getPaletteCommands,
  );

  const all = [...builtIns, ...extensions];

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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search projects and actions."
    >
      {/* radix-nova's CommandDialog does NOT wrap children in <Command>
          (unlike classic shadcn) — the root must be provided here */}
      <Command>
        <CommandInput placeholder="Search or jump to…" />
        <CommandEmpty>No results.</CommandEmpty>
        <CommandList>
          {order.map((section) => (
            <CommandGroup key={section} heading={section}>
              {bySection.get(section)!.map((command) => (
                <CommandItem
                  key={command.id}
                  value={`${section}:${command.label}:${command.keywords?.join(' ') ?? ''}`}
                  onSelect={() => {
                    command.run();
                    onOpenChange(false);
                  }}
                >
                  {command.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
