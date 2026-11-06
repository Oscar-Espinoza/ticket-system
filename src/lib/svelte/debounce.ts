// A restartable timer: `schedule` replaces any earlier pending call, `cancel`
// drops it, `pending` says whether one is waiting.

export interface Debouncer {
  readonly pending: boolean;
  schedule: (run: () => void, ms: number) => void;
  cancel: () => void;
}

export function createDebouncer(): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    get pending() {
      return timer !== null;
    },
    schedule(run, ms) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, ms);
    },
    cancel,
  };
}
