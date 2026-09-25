'use client';

// Color swatch button + popover with preset swatches and a hex field. Shared
// by the workflow-state and label settings rows.

import { useState } from 'react';
import { Check } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const PRESET_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#0f9d9f',
  '#4cb782',
  '#f2c94c',
  '#e5a100',
  '#f2994a',
  '#fc7840',
  '#eb5757',
  '#db5e9a',
  '#bb87fc',
  '#3b82f6',
  '#747981',
  '#9da1a8',
] as const;

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function ColorPicker({
  value,
  onChange,
  label = 'Color',
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  /** Accessible name of the trigger. */
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${value}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <span className="size-3.5 rounded-full" style={{ backgroundColor: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="grid grid-cols-7 gap-1" role="listbox" aria-label="Preset colors">
          {PRESET_COLORS.map((color) => {
            const selected = color === value.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={color}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className="flex size-4 items-center justify-center rounded-full"
                  style={{ backgroundColor: color }}
                >
                  {selected && <Check className="size-3 text-white" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!HEX_RE.test(draft)) return;
            onChange(draft.toLowerCase());
            setOpen(false);
          }}
        >
          <span
            className="size-4 shrink-0 rounded-full border"
            style={{ backgroundColor: HEX_RE.test(draft) ? draft : 'transparent' }}
            aria-hidden="true"
          />
          <Input
            value={draft}
            onChange={(e) => {
              const next = e.target.value.trim();
              setDraft(next.startsWith('#') ? next : `#${next}`);
            }}
            onBlur={() => {
              if (HEX_RE.test(draft) && draft.toLowerCase() !== value.toLowerCase()) {
                onChange(draft.toLowerCase());
              }
            }}
            maxLength={7}
            aria-label="Hex color"
            aria-invalid={!HEX_RE.test(draft) ? true : undefined}
            className={cn('h-7 font-mono text-xs')}
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}
