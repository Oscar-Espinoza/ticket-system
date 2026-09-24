'use client';

import { useState, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Props every popover picker accepts (trigger = children, via asChild). */
export interface PickerPopoverProps {
  /** The trigger element (rendered via asChild). */
  children: ReactNode;
  /** Controlled open state (e.g. opened by a hotkey); uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** E.g. return focus to a list row instead of the trigger. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function PickerPopover({
  children,
  open,
  onOpenChange,
  align = 'start',
  side,
  onCloseAutoFocus,
  className,
  content,
}: PickerPopoverProps & {
  className?: string;
  /** Rendered only while open; `close` dismisses the popover. */
  content: (close: () => void) => ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isOpen = open ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className={cn('w-56 gap-0 p-0', className)}
        onCloseAutoFocus={onCloseAutoFocus}
        // React events bubble through portals: keep picks from reaching a
        // clickable row / card underneath.
        onClick={(event) => event.stopPropagation()}
      >
        {isOpen && content(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

/** cmdk filter over `keywords` only — item values are ids and must not match. */
export function keywordFilter(_value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  return keywords?.some((k) => k.toLowerCase().includes(query)) ? 1 : 0;
}

/** Digit shortcut handler: `pick(n)` for 0–9 while the search box is empty. */
export function digitShortcut(search: string, pick: (digit: number) => boolean) {
  return (event: React.KeyboardEvent) => {
    if (search || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!/^[0-9]$/.test(event.key)) return;
    if (pick(Number(event.key))) event.preventDefault();
  };
}
