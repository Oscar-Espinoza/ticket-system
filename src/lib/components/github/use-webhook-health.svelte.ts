// Whether the registered GitHub hook subscribes to every event we handle —
// hooks from before review / CI support only send pull_request + push. Checked
// with the viewer's own token; 'unknown' (no access) shows nothing.
// Call during component init; `enabled` is read reactively.

import { toast } from 'svelte-sonner';

import { getGithubWebhookHealth, updateGithubWebhookEvents } from '@/lib/actions/developer';

type Health = 'current' | 'outdated' | 'missing' | 'unknown';

export function useWebhookHealth(projectId: () => string, enabled: () => boolean) {
  let status = $state<Health>('unknown');
  let updating = $state(false);

  $effect(() => {
    if (!enabled()) return;
    const id = projectId();
    let cancelled = false;
    getGithubWebhookHealth(id)
      .then((result) => {
        if (!cancelled && result.ok) status = result.status;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  async function update() {
    updating = true;
    try {
      const result = await updateGithubWebhookEvents(projectId());
      if (result.ok) {
        status = 'current';
        toast.success('Webhook updated');
      } else {
        toast.error(result.error);
      }
    } finally {
      updating = false;
    }
  }

  return {
    get status(): Health {
      return enabled() ? status : 'unknown';
    },
    get updating() {
      return updating;
    },
    update,
    // A fresh registration subscribes to every event.
    markCurrent: () => {
      status = 'current';
    },
  };
}
