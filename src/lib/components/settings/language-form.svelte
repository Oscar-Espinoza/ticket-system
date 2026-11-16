<script lang="ts">
  // Settings › Profile › Language. Saved on the account (every device, and
  // emails); the page data is refreshed and the root layout switches the
  // interface in place (src/lib/svelte/locale-switch.ts), no reload.
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Label } from '@/lib/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { updateLanguage } from '@/lib/actions/profile';
  import { LOCALES, LOCALE_NAMES, m, toAppLocale, type AppLocale } from '@/lib/i18n';
  import { writeLocaleCookie } from '@/lib/svelte/locale-switch';
  import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';
  import { cn } from '@/lib/utils';

  let { locale }: { locale: AppLocale | null } = $props();

  const AUTO = 'auto';
  // Starts from the saved language; afterwards it follows the radios.
  let value = $state(untrack(() => locale) ?? AUTO);
  let saving = $state(false);
  /** What the account has saved; `value` is what the radios show. */
  let saved = untrack(() => locale) ?? AUTO;
  /** A choice made while a save was in flight: saved right after it. */
  let pending: string | null = null;

  // The saved language can change under the form without a re-render (a late
  // choice saved Automatic while the screen stays English): follow the page
  // data whenever nothing is being saved.
  $effect(() => {
    const current = locale ?? AUTO;
    untrack(() => {
      if (saving || pending !== null) return;
      saved = current;
      value = current;
    });
  });

  const options = $derived([
    { value: AUTO, label: m.settings_language_auto(), hint: m.settings_language_auto_hint() },
    ...LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], hint: '' })),
  ]);

  async function choose(next: string) {
    value = next;
    if (saving) {
      pending = next;
      return;
    }
    if (next === saved) return;
    saving = true;
    let target = next;
    for (;;) {
      const chosen = toAppLocale(target);
      const result = await updateLanguage(chosen);
      if (!result.ok) {
        pending = null;
        value = saved;
        toast.error(result.error ?? m.settings_language_save_failed());
        break;
      }
      saved = target;
      // This browser's cookie follows the choice (it is what a signed-out page
      // uses); Automatic removes it.
      writeLocaleCookie(chosen);
      const again = pending;
      pending = null;
      if (again === null || again === saved) break;
      target = again;
    }
    // The refreshed page data carries the saved locale; the root layout
    // switches to it in place. When the language shown doesn't change
    // (Automatic and the browser already says English), nothing re-renders and
    // the radios simply stay as chosen.
    await refreshAfterWrite();
    saving = false;
    // A choice made while the page data was refreshing: save it now.
    const late = pending;
    pending = null;
    if (late !== null && late !== saved) void choose(late);
  }
</script>

<section>
  <h2 class="mb-1 text-base font-medium">{m.settings_language_title()}</h2>
  <p class="mb-3 text-sm text-muted-foreground">{m.settings_language_description()}</p>
  <RadioGroup
    aria-label={m.settings_language_title()}
    {value}
    onValueChange={choose}
    aria-busy={saving}
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
