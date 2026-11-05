// Port of src/components/issue-detail/use-draft.ts.
//
// Local draft that resets whenever the saved value changes (including an
// optimistic rollback), without an effect.
//
//   const title = useDraft(() => issue.title);
//   title.current            read (reactive)
//   title.current = 'x'      write (or bind:value={title.current}, or title.set('x'))
//
// React returned `[draft, setDraft]`; reading `.current` replaces `draft`.
// Pass a getter: the draft resets only when the saved *value* changes, not
// when the object it comes from is replaced with an equal value (as React's
// `saved !== base` check did).

export interface Draft {
  current: string;
  set: (value: string) => void;
}

export function useDraft(saved: () => string): Draft {
  // Equal values don't propagate past this derived, so `draft` below only
  // resets when the saved string really changes.
  const base = $derived(saved());
  let draft = $derived(base);
  return {
    get current() {
      return draft;
    },
    set current(value: string) {
      draft = value;
    },
    set(value: string) {
      draft = value;
    },
  };
}
