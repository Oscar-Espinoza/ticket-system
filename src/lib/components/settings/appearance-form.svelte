<script lang="ts">
  import type { Component } from 'svelte';
  import MonitorIcon from '@lucide/svelte/icons/monitor';
  import MoonIcon from '@lucide/svelte/icons/moon';
  import Rows2Icon from '@lucide/svelte/icons/rows-2';
  import Rows4Icon from '@lucide/svelte/icons/rows-4';
  import SunIcon from '@lucide/svelte/icons/sun';

  import { Label } from '@/lib/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { applyDensity, readDensity, type Density } from '@/lib/density';
  import { useTheme } from '@/lib/svelte/theme.svelte';
  import { cn } from '@/lib/utils';

  type Option = { value: string; label: string; icon: Component; hint?: string };

  const THEMES: Option[] = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: MonitorIcon, hint: 'Follows your OS' },
  ];

  const DENSITIES: Option[] = [
    { value: 'comfortable', label: 'Comfortable', icon: Rows2Icon },
    { value: 'compact', label: 'Compact', icon: Rows4Icon, hint: 'Smaller text and spacing' },
  ];

  const theme = useTheme();

  // Theme and density live in the browser; render the controls only after
  // hydration so the server's "unknown" never mismatches the checked state.
  let mounted = $state(false);
  $effect(() => {
    mounted = true;
  });

  let density = $state<Density>('comfortable');
  $effect(() => {
    density = readDensity();
  });
</script>

{#snippet optionCards(name: string, value: string, onChange: (value: string) => void, options: Option[])}
  <RadioGroup
    aria-label={name}
    {value}
    onValueChange={onChange}
    class="grid-cols-1 sm:grid-cols-3"
  >
    {#each options as option (option.value)}
      {@const id = `${name}-${option.value}`.toLowerCase()}
      {@const Icon = option.icon}
      <Label
        for={id}
        class={cn(
          'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal transition-colors',
          'hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40',
        )}
      >
        <RadioGroupItem {id} value={option.value} class="mt-0.5" />
        <span class="flex flex-col gap-1">
          <span
            class="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground"
          >
            <Icon />
            {option.label}
          </span>
          {#if option.hint}
            <span class="text-xs text-muted-foreground">{option.hint}</span>
          {/if}
        </span>
      </Label>
    {/each}
  </RadioGroup>
{/snippet}

{#if !mounted}
  <div class="h-64" aria-hidden="true"></div>
{:else}
  <div class="flex flex-col gap-8">
    <section>
      <h2 class="mb-1 text-base font-medium">Theme</h2>
      <p class="mb-3 text-sm text-muted-foreground">Choose a theme, or follow your system setting.</p>
      {@render optionCards('Theme', theme.theme ?? 'system', theme.setTheme, THEMES)}
    </section>

    <section>
      <h2 class="mb-1 text-base font-medium">Interface density</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        Compact fits more issues on screen. Saved on this device.
      </p>
      {@render optionCards(
        'Density',
        density,
        (next) => {
          const value = next === 'compact' ? 'compact' : 'comfortable';
          density = value;
          applyDensity(value);
        },
        DENSITIES,
      )}
    </section>
  </div>
{/if}
