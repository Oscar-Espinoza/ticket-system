<!--
  Settings → Security → Sessions:
  every signed-in device, newest activity first; revoke one or all others.
  Revocation goes through server actions that map the session id to its token
  server-side.
-->
<script module lang="ts">
  export interface SessionView {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    /** ISO strings. */
    createdAt: string;
    updatedAt: string;
  }

</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import { DATE_MEDIUM_LOCAL_FORMAT } from '@/lib/format';
  import { untrack } from 'svelte';
  import LaptopIcon from '@lucide/svelte/icons/laptop';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
  import { toast } from 'svelte-sonner';

  import { revokeOtherSessions, revokeSession } from '@/lib/actions/security';
  import { relativeTime } from '@/lib/relative-time';
  import { Button } from '@/lib/components/ui/button';
  import { LabelChip } from '@/lib/components/ui-icons';
  import { describeUserAgent, isMobileUserAgent } from '@/lib/components/security/user-agent';

  let { sessions: initial, currentId }: { sessions: SessionView[]; currentId: string } = $props();

  // useState(initial): seeded once, then local.
  let sessions = $state(untrack(() => initial));
  let pendingId = $state<string | null>(null);
  let pendingAll = $state(false);
  const others = $derived(sessions.filter((s) => s.id !== currentId));

  async function revoke(id: string) {
    pendingId = id;
    const result = await revokeSession({ sessionId: id });
    pendingId = null;
    if (result.ok) {
      sessions = sessions.filter((s) => s.id !== id);
      toast.success(m.settings_sec_session_signed_out_toast());
    } else toast.error(result.error);
  }

  async function revokeAll() {
    pendingAll = true;
    try {
      const result = await revokeOtherSessions();
      if (result.ok) {
        sessions = sessions.filter((s) => s.id === currentId);
        toast.success(m.settings_sec_all_signed_out_toast());
      } else toast.error(result.error);
    } finally {
      pendingAll = false;
    }
  }
</script>

<div class="flex flex-col gap-3">
  <ul class="divide-y divide-border rounded-lg border border-border">
    {#each sessions as session (session.id)}
      {@const current = session.id === currentId}
      {@const Icon = isMobileUserAgent(session.userAgent) ? SmartphoneIcon : LaptopIcon}
      <li class="flex items-center gap-3 px-4 py-2.5">
        <Icon aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 truncate text-sm">
            {describeUserAgent(session.userAgent)}
            {#if current}<LabelChip color="primary">{m.settings_sec_this_device()}</LabelChip>{/if}
          </p>
          <p class="truncate text-xs text-muted-foreground">
            {[
              session.ipAddress,
              current
                ? m.settings_sec_active_now()
                : m.settings_sec_active_when({ when: relativeTime(new Date(session.updatedAt)) }),
              m.settings_sec_signed_in({ date: DATE_MEDIUM_LOCAL_FORMAT.format(new Date(session.createdAt)) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {#if !current}
          <Button
            variant="ghost"
            size="sm"
            disabled={pendingId === session.id}
            onclick={() => revoke(session.id)}
          >
            {#if pendingId === session.id}<Loader2Icon class="animate-spin" />{/if}
            {m.settings_sec_sign_out()}
          </Button>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="flex items-center justify-between gap-4">
    <p class="text-xs text-muted-foreground">{m.settings_sec_sessions_note()}</p>
    {#if others.length > 0}
      <Button variant="outline" size="sm" disabled={pendingAll} onclick={revokeAll}>
        {#if pendingAll}<Loader2Icon class="animate-spin" />{/if}
        {m.settings_sec_sign_out_others()}
      </Button>
    {/if}
  </div>
</div>
