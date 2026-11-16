<script lang="ts">
  import { m } from '@/lib/i18n';
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
    { value: 'light', label: m.settings_appearance_light(), icon: SunIcon },
    { value: 'dark', label: m.settings_appearance_dark(), icon: MoonIcon },
    { value: 'system', label: m.settings_appearance_system(), icon: MonitorIcon, hint: m.settings_appearance_system_hint() },
  ];

  const DENSITIES: Option[] = [
    { value: 'comfortable', label: m.settings_appearance_comfortable(), icon: Rows2Icon },
    { value: 'compact', label: m.settings_appearance_compact(), icon: Rows4Icon, hint: m.settings_appearance_compact_hint() },
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

{#snippet optionCards(name: string, label: string, value: string, onChange: (value: string) => void, options: Option[])}
  <RadioGroup
    aria-label={label}
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
      <h2 class="mb-1 text-base font-medium">{m.settings_appearance_theme()}</h2>
      <p class="mb-3 text-sm text-muted-foreground">{m.settings_appearance_theme_desc()}</p>
      {@render optionCards('Theme', m.settings_appearance_theme(), theme.theme ?? 'system', theme.setTheme, THEMES)}
    </section>

    <section>
      <h2 class="mb-1 text-base font-medium">{m.settings_appearance_density()}</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        {m.settings_appearance_density_desc()}
      </p>
      {@render optionCards(
        'Density',
        m.settings_appearance_density_label(),
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
