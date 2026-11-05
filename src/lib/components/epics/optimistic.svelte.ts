// useOptimistic for the epics / roadmap / initiatives ports.
//
// React's useOptimistic shows `base` with every pending optimistic op applied
// on top, and drops the ops only when *all* transitions that applied them have
// finished (async transitions are entangled), by which time the action's
// revalidation has delivered fresh props. Here:
//
//   const list = new Optimistic(() => props.milestones, reduce);
//   list.current                       base + pending ops (reactive)
//   void list.transition(async () => {  // startTransition(async () => …)
//     list.apply(op);                   // the setOptimistic call
//     const result = await someAction(…); // the generated wrapper awaits the refresh
//     if (!result.ok) toast.error(result.error);
//   });
//
// When the last running transition settles the ops are cleared, so the view
// falls back to the (refreshed) server data — a rollback on failure, the
// settled value on success.

export class Optimistic<T, Op> {
  #base: () => T;
  #reduce: (state: T, op: Op) => T;
  #ops = $state.raw<Op[]>([]);
  #running = 0;
  #value = $derived.by(() => this.#ops.reduce(this.#reduce, this.#base()));

  constructor(base: () => T, reduce: (state: T, op: Op) => T) {
    this.#base = base;
    this.#reduce = reduce;
  }

  get current(): T {
    return this.#value;
  }

  /** True while any transition is running (useTransition's isPending). */
  pending = $state(false);

  apply(op: Op) {
    this.#ops = [...this.#ops, op];
  }

  async transition(fn: () => Promise<unknown>): Promise<void> {
    this.#running += 1;
    this.pending = true;
    try {
      await fn();
    } finally {
      this.#running -= 1;
      if (this.#running === 0) {
        this.#ops = [];
        this.pending = false;
      }
    }
  }
}

/** useOptimistic(value, (current, patch) => ({ ...current, ...patch })). */
export const mergePatch = <T extends object>(current: T, patch: Partial<T>): T => ({
  ...current,
  ...patch,
});
