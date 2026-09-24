'use client';

import { Triangle } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useProjectData } from '@/components/project/project-data';
import { estimateOptions } from '@/lib/estimates';
import { PickerPopover, keywordFilter, type PickerPopoverProps } from './picker-popover';

const NO_ESTIMATE = '__none';

export interface EstimateOptionsProps {
  /** null = no estimate; undefined = mixed (bulk edit). */
  value: number | null | undefined;
  onSelect: (estimate: number | null) => void;
}

/** Renders nothing when the project's estimate scale is "none". */
export function EstimateOptions({ value, onSelect }: EstimateOptionsProps) {
  const { project } = useProjectData();
  const options = estimateOptions(project.estimateScale);
  if (options.length === 0) return null;

  return (
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Set estimate…" />
      <CommandList>
        <CommandEmpty>No estimate found.</CommandEmpty>
        <CommandItem
          value={NO_ESTIMATE}
          keywords={['No estimate', 'None']}
          data-checked={value === null}
          onSelect={() => onSelect(null)}
        >
          <Triangle className="text-muted-foreground" />
          No estimate
        </CommandItem>
        {options.map((option) => (
          <CommandItem
            key={option.value}
            value={String(option.value)}
            keywords={[option.label, `${option.label} points`]}
            data-checked={option.value === value}
            onSelect={() => onSelect(option.value)}
          >
            <Triangle />
            {option.label}
            {option.label !== String(option.value) ? '' : ` point${option.value === 1 ? '' : 's'}`}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/** Renders nothing (not even the trigger) when estimates are off. */
export function EstimatePicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: number | null | undefined;
  onChange: (estimate: number | null) => void;
}) {
  const { project } = useProjectData();
  if (project.estimateScale === 'none') return null;
  return (
    <PickerPopover
      {...popover}
      className="w-48"
      content={(close) => (
        <EstimateOptions
          value={value}
          onSelect={(estimate) => {
            close();
            onChange(estimate);
          }}
        />
      )}
    />
  );
}
