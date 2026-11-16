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

/** How long to wait for the page data after a save before unlocking (the data still applies when it comes). */
const REFRESH_WAIT_MS = 8000;
/** After that, how long a confirmed choice keeps overriding page data that never caught up. */
const HOLD_FALLBACK_MS = 30000;

const sleep = (ms: number) => new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));

export class LanguageController {
  /** The language to show while a choice is being saved (null: follow the page data). */
  held = $state<AppLocale | null>(null);
  /** The radio to show while a choice is being saved (null: what the account has saved). */
  choice = $state<LanguageChoice | null>(null);
  status = $state<LanguageSaveStatus>('idle');

  #saving = false;
  #pending: LanguageChoice | null = null;
  #statusTimer: ReturnType<typeof setTimeout> | undefined;
  #holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** Saved, but the page data hadn't caught up in time: clear `held` once it shows this. */
  #awaitingData: AppLocale | null = null;
  /** The signed-in account; a save sequence only continues for the account that started it. */
  #user: string | null;
  /** Bumped on reset: a running sequence from an older generation stops at its next step. */
  #generation = 0;

  constructor(user: string | null) {
    this.#user = user;
  }

  /**
   * The signed-in account changed (sign-in, sign-out, another account): drop
   * whatever was shown or queued for the previous one. A request already sent
   * finishes for that account (its session sent it); nothing more is sent.
   */
  accountChanged(user: string | null) {
    if (user === this.#user) return;
    this.#user = user;
    this.#reset();
  }

  /** New page data arrived (root layout): ends a hold that was waiting for it. */
  pageData(locale: string) {
    if (this.#awaitingData && !this.#saving && locale === this.#awaitingData) this.#settle();
  }

  /**
   * Shows `next` now and saves it in the background. `saved` is what the
   * account has at the moment of the click. Clicks made while a save runs are
   * queued; the last one is what ends up saved.
   */
  async choose(next: LanguageChoice, saved: LanguageChoice): Promise<void> {
    this.choice = next;
    this.held = toAppLocale(next) ?? browserLocale();
    this.#awaitingData = null;
    clearTimeout(this.#holdTimer);
    if (this.#saving) {
      this.#pending = next;
      return;
    }
    if (next === saved) {
      this.#settle();
      return;
    }

    const generation = this.#generation;
    const live = () => generation === this.#generation;
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
      if (!live()) return;
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
    // profile's saved value), waited for at most REFRESH_WAIT_MS so a stuck
    // load can't lock the form. Nothing to refresh when nothing was saved: a
    // failed save (e.g. offline) just goes back to the language on record,
    // and a refresh would fail too (Kit then falls back to a full navigation).
    let refreshed = true;
    if (anySaved) {
      const outcome = await Promise.race([refreshAfterWrite().catch(() => undefined), sleep(REFRESH_WAIT_MS)]);
      if (!live()) return;
      refreshed = outcome !== 'timeout';
    }
    this.#saving = false;

    const late = this.#pending;
    this.#pending = null;
    if (!failed && late !== null && late !== saved) {
      await this.choose(late, saved);
      return;
    }
    if (failed) {
      this.#settle();
      this.status = 'idle';
      return;
    }
    if (refreshed) {
      this.#settle();
    } else {
      // Saved, but the page data is late: keep showing the saved choice until
      // it arrives (pageData), or give up holding after a while.
      this.#awaitingData = this.held;
      this.#holdTimer = setTimeout(() => this.#settle(), HOLD_FALLBACK_MS);
    }
    this.status = 'saved';
    this.#statusTimer = setTimeout(() => (this.status = 'idle'), SAVED_VISIBLE_MS);
  }

  /** Back to showing what the page data says. */
  #settle() {
    this.held = null;
    this.choice = null;
    this.#awaitingData = null;
    clearTimeout(this.#holdTimer);
  }

  #reset() {
    this.#generation += 1;
    this.#saving = false;
    this.#pending = null;
    clearTimeout(this.#statusTimer);
    this.status = 'idle';
    this.#settle();
  }
}

export const [getLanguageController, setLanguageController] = createContext<LanguageController>();
