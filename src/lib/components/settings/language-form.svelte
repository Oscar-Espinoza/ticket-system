<script lang="ts">
  // Settings › Profile › Language. Saved on the account (every device, and
  // emails), then the page reloads in the new language.
  import { toast } from 'svelte-sonner';
  import { Label } from '@/lib/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { updateLanguage } from '@/lib/actions/profile';
  import { LOCALES, LOCALE_NAMES, m, toAppLocale, type AppLocale } from '@/lib/i18n';
  import { cookieMaxAge, cookieName } from '@/lib/paraglide/runtime';
  import { cn } from '@/lib/utils';

  let { locale }: { locale: AppLocale | null } = $props();

  const AUTO = 'auto';
  let value = $state(locale ?? AUTO);
  let saving = $state(false);

  const options = $derived([
    { value: AUTO, label: m.settings_language_auto(), hint: m.settings_language_auto_hint() },
    ...LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], hint: '' })),
  ]);

  async function choose(next: string) {
    if (saving || next === value) return;
    const previous = value;
    value = next;
    saving = true;
    const chosen = toAppLocale(next);
    const result = await updateLanguage(chosen);
    if (!result.ok) {
      value = previous;
      saving = false;
      toast.error(result.error ?? m.settings_language_save_failed());
      return;
    }
    // This browser's cookie follows the choice (it is what a signed-out page
    // uses); Automatic removes it. Always reload, also when the language shown
    // doesn't change, so the page never stays disabled.
    document.cookie = chosen
      ? `${cookieName}=${chosen}; path=/; max-age=${cookieMaxAge}; samesite=lax`
      : `${cookieName}=; path=/; max-age=0`;
    location.reload();
  }
</script>

<section>
  <h2 class="mb-1 text-base font-medium">{m.settings_language_title()}</h2>
  <p class="mb-3 text-sm text-muted-foreground">{m.settings_language_description()}</p>
  <RadioGroup
    aria-label={m.settings_language_title()}
    {value}
    onValueChange={choose}
    disabled={saving}
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
</section>
