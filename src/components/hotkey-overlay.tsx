'use client';

// Shortcut overlay — `?` in the hotkey framework (M3 scope 2, C3).
//
// Renders a live snapshot of the hotkey registry: ONLY currently-registered
// shortcuts appear. When M5–M7 unmount their scoped registrations (or never
// register them), their rows are absent — there is no static list here.
// Esc closes (radix Dialog).

import { useSyncExternalStore } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatHotkey,
  getHotkeys,
  subscribeHotkeys,
  type Hotkey,
} from '@/lib/hotkeys';

export function HotkeyOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hotkeys = useSyncExternalStore(
    subscribeHotkeys,
    getHotkeys,
    getHotkeys,
  );

  const order: string[] = [];
  const byScope = new Map<string, Hotkey[]>();
  for (const hotkey of hotkeys) {
    const scope = hotkey.scope ?? 'Global';
    if (!byScope.has(scope)) {
      byScope.set(scope, []);
      order.push(scope);
    }
    byScope.get(scope)!.push(hotkey);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts currently registered in this session.
          </DialogDescription>
        </DialogHeader>

        <div data-hotkey-overlay className="flex flex-col gap-4">
          {order.map((scope) => (
            <div key={scope}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {scope}
              </p>
              <ul className="flex flex-col gap-1.5">
                {byScope.get(scope)!.map((hotkey) => (
                  <li
                    key={`${hotkey.scope ?? 'Global'}-${hotkey.key}-${hotkey.description}`}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-foreground">{hotkey.description}</span>
                    <kbd className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      {formatHotkey(hotkey)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
