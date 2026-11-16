// Settings › Language without waiting: the page switches to the chosen language
// at once (every message for the page is already in the browser), and saving
// it on the account plus refreshing the page data happen in the background,
// with a small "Saving… / Saved" status next to the options.
//
// Lives in the root layout (src/routes/+layout.svelte), not in the form: the
// switch re-renders the app subtree, the form included, while the save is
// still running. The root layout shows `held` while it is set, and the page
// data's locale otherwise.

import { createContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { updateLanguage } from '@/lib/actions/profile';
import { m } from '@/lib/i18n';
import { BASE_LOCALE, toAppLocale, type AppLocale } from '@/lib/i18n-locales';
import { writeLocaleCookie } from '@/lib/svelte/locale-switch';
import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';

/** A radio in Settings › Language: a language, or Automatic. */
export type LanguageChoice = AppLocale | 'auto';
export type LanguageSaveStatus = 'idle' | 'saving' | 'saved';

const SAVED_VISIBLE_MS = 2000;

/**
 * The browser's language among the app's, the way the server reads
 * Accept-Language (exact tag, then its base: es-AR → es), else English. Used
 * to show "Automatic" at once; the server's answer settles it afterwards.
 */
export function browserLocale(): AppLocale {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    const match = toAppLocale(tag) ?? toAppLocale(tag.split('-')[0]);
    if (match) return match;
  }
  return BASE_LOCALE;
}

export class LanguageController {
  /** The language to show while a choice is being saved (null: follow the page data). */
  held = $state<AppLocale | null>(null);
  /** The radio to show while a choice is being saved (null: what the account has saved). */
  choice = $state<LanguageChoice | null>(null);
  status = $state<LanguageSaveStatus>('idle');

  #saving = false;
  #pending: LanguageChoice | null = null;
  #statusTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Shows `next` now and saves it in the background. `saved` is what the
   * account has at the moment of the click. Clicks made while a save runs are
   * queued; the last one is what ends up saved.
   */
  async choose(next: LanguageChoice, saved: LanguageChoice): Promise<void> {
    this.choice = next;
    this.held = toAppLocale(next) ?? browserLocale();
    if (this.#saving) {
      this.#pending = next;
      return;
    }
    if (next === saved) {
      this.#settle();
      return;
    }

    this.#saving = true;
    clearTimeout(this.#statusTimer);
    this.status = 'saving';
    let target = next;
    let failed = false;
    let anySaved = false;
    for (;;) {
      const locale = toAppLocale(target);
      // A network failure throws instead of answering { ok: false }.
      const result = await updateLanguage(locale).catch(() => ({ ok: false as const, error: undefined }));
      if (!result.ok) {
        failed = true;
        this.#pending = null;
        toast.error(result.error ?? m.settings_language_save_failed());
        break;
      }
      saved = target;
      anySaved = true;
      // This browser's cookie follows the choice (what a signed-out page
      // uses); Automatic removes it.
      writeLocaleCookie(locale);
      const again = this.#pending;
      this.#pending = null;
      if (again === null || again === saved) break;
      target = again;
    }

    // Fresh page data in the saved language (server-formatted text, the
    // profile's saved value). Nothing to refresh when nothing was saved: a
    // failed save (e.g. offline) just goes back to the language on record,
    // and a refresh would fail too (Kit then falls back to a full navigation).
    if (anySaved) await refreshAfterWrite().catch(() => {});
    this.#saving = false;

    const late = this.#pending;
    this.#pending = null;
    if (!failed && late !== null && late !== saved) {
      await this.choose(late, saved);
      return;
    }
    this.#settle();
    if (failed) {
      this.status = 'idle';
    } else {
      this.status = 'saved';
      this.#statusTimer = setTimeout(() => (this.status = 'idle'), SAVED_VISIBLE_MS);
    }
  }

  /** Back to showing what the page data says. */
  #settle() {
    this.held = null;
    this.choice = null;
  }
}

export const [getLanguageController, setLanguageController] = createContext<LanguageController>();
