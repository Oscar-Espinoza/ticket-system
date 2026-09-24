'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Rows2, Rows4, Sun } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { applyDensity, readDensity, type Density } from '@/lib/density';
import { cn } from '@/lib/utils';

const subscribeNothing = () => () => {};

const THEMES = [
  { value: 'light', label: 'Light', icon: <Sun /> },
  { value: 'dark', label: 'Dark', icon: <Moon /> },
  { value: 'system', label: 'System', icon: <Monitor />, hint: 'Follows your OS' },
];

const DENSITIES = [
  { value: 'comfortable', label: 'Comfortable', icon: <Rows2 /> },
  { value: 'compact', label: 'Compact', icon: <Rows4 />, hint: 'Smaller text and spacing' },
];

function OptionCards({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon: ReactNode; hint?: string }[];
}) {
  return (
    <RadioGroup
      aria-label={name}
      value={value}
      onValueChange={onChange}
      className="grid-cols-1 sm:grid-cols-3"
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`.toLowerCase();
        return (
          <Label
            key={option.value}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal transition-colors',
              'hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40',
            )}
          >
            <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground">
                {option.icon}
                {option.label}
              </span>
              {option.hint && (
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              )}
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useState<Density>(readDensity);
  // Theme and density live in the browser; render the controls only after
  // hydration so the server's "unknown" never mismatches the checked state.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  if (!mounted) return <div className="h-64" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-1 text-base font-medium">Theme</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose a theme, or follow your system setting.
        </p>
        <OptionCards
          name="Theme"
          value={theme ?? 'system'}
          onChange={setTheme}
          options={THEMES}
        />
      </section>

      <section>
        <h2 className="mb-1 text-base font-medium">Interface density</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Compact fits more issues on screen. Saved on this device.
        </p>
        <OptionCards
          name="Density"
          value={density}
          onChange={(next) => {
            const value = next === 'compact' ? 'compact' : 'comfortable';
            setDensity(value);
            applyDensity(value);
          }}
          options={DENSITIES}
        />
      </section>
    </div>
  );
}
