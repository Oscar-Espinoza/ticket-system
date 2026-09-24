'use client';

// Searchable timezone combobox (~400 IANA zones is too many for a plain select).

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function TimezonePicker({
  id,
  name,
  timezones,
  defaultValue,
}: {
  id: string;
  /** Form field name; the value is submitted through a hidden input. */
  name: string;
  timezones: string[];
  defaultValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);

  const detect = () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) setValue(zone);
  };

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full max-w-xs justify-between font-normal"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? value.replaceAll('_', ' ') : 'Not set'}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search timezones…" />
            <CommandList>
              <CommandEmpty>No timezone found.</CommandEmpty>
              {timezones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  keywords={[zone.replaceAll('_', ' ')]}
                  onSelect={() => {
                    setValue(zone);
                    setOpen(false);
                  }}
                >
                  <Check className={cn(zone === value ? 'opacity-100' : 'opacity-0')} />
                  {zone.replaceAll('_', ' ')}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="sm" onClick={detect}>
        Use this device&rsquo;s
      </Button>
    </div>
  );
}
