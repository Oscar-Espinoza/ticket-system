<script lang="ts">
  // Settings › Profile › Language. The page switches to the chosen language at
  // once; saving it on the account (every device, and emails) runs in the
  // background with a small status line (src/lib/svelte/language-controller.svelte.ts).
  import CheckIcon from '@lucide/svelte/icons/check';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { Label } from '@/lib/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { LOCALES, LOCALE_NAMES, m, type AppLocale } from '@/lib/i18n';
  import { getLanguageController, type LanguageChoice } from '@/lib/svelte/language-controller.svelte';
  import { cn } from '@/lib/utils';

  let { locale }: { locale: AppLocale | null } = $props();

  const AUTO = 'auto';
  const language = getLanguageController();

  /** What the account has saved, from the page data. */
  const saved = $derived<LanguageChoice>(locale ?? AUTO);
  /** While a choice is being saved the radios show it; otherwise the saved one. */
  const value = $derived(language.choice ?? saved);

  const options = $derived([
    { value: AUTO, label: m.settings_language_auto(), hint: m.settings_language_auto_hint() },
    ...LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], hint: '' })),
  ]);

  function choose(next: string) {
    void language.choose(next as LanguageChoice, saved);
  }
</script>

<section>
  <h2 class="mb-1 text-base font-medium">{m.settings_language_title()}</h2>
  <p class="mb-3 text-sm text-muted-foreground">{m.settings_language_description()}</p>
  <RadioGroup
    aria-label={m.settings_language_title()}
    {value}
    onValueChange={choose}
    aria-busy={language.status === 'saving'}
    class="grid-cols-1 sm:grid-cols-3"
  >
    {#each options as option (option.value)}
      {@const id = `language-${option.value}`}
      <Label
        for={id}
        class={cn(
          'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal transition-colors',
          'hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40',
        )}
      >
        <RadioGroupItem {id} value={option.value} class="mt-0.5" />
        <span class="flex flex-col gap-1">
          <span class="text-sm font-medium" lang={option.value === AUTO ? undefined : option.value}>{option.label}</span>
          {#if option.hint}
            <span class="text-xs text-muted-foreground">{option.hint}</span>
          {/if}
        </span>
      </Label>
    {/each}
  </RadioGroup>
  <!-- Fixed height: the line appearing must not move the page. -->
  <p class="mt-2 flex h-4 items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
    {#if language.status === 'saving'}
      <LoaderCircleIcon class="size-3.5 animate-spin" aria-hidden="true" />
      {m.settings_language_saving()}
    {:else if language.status === 'saved'}
      <CheckIcon class="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      {m.settings_language_saved()}
    {/if}
  </p>
</section>
