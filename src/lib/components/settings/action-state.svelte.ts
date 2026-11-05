// Svelte stand-in for React's `useActionState(action, initial)` as the settings
// forms use it: the generated `(prev, formData)` wrappers in `@/lib/actions/*`
// return the next state, `pending` is true while one runs.
//
//   const form = createActionState(updateProjectDetails, {});
//   <form onsubmit={form.onsubmit}> … form.state.errors?.name … form.pending
//
// Call during component init. Unlike React 19's `<form action>`, the form is
// not reset after the action finishes (typed values survive a validation error;
// on success the refreshed props re-seed the inputs).

import { toast } from 'svelte-sonner';

export function createActionState<S>(action: (prev: S, data: FormData) => Promise<S>, initial: S) {
  let state = $state.raw<S>(initial);
  let pending = $state(false);

  async function submit(form: HTMLFormElement | FormData) {
    // Read the fields now: the FormData must reflect the DOM at submit time.
    const data = form instanceof FormData ? form : new FormData(form);
    pending = true;
    try {
      state = await action(state, data);
    } finally {
      pending = false;
    }
  }

  return {
    get state() {
      return state;
    },
    get pending() {
      return pending;
    },
    submit,
    /** `<form onsubmit={form.onsubmit}>` */
    onsubmit(event: SubmitEvent) {
      event.preventDefault();
      void submit(event.currentTarget as HTMLFormElement);
    },
  };
}

export type ActionStateHandle<S> = ReturnType<typeof createActionState<S>>;

/**
 * Toast once per action result (server errors only; field errors render
 * inline). Call during component init; `getState` is read reactively.
 */
export function useResultToast(
  getState: () => { success?: boolean; errors?: { server?: string } } | undefined,
  success: string,
) {
  $effect(() => {
    const state = getState();
    if (state?.success) toast.success(success);
    else if (state?.errors?.server) toast.error(state.errors.server);
  });
}
