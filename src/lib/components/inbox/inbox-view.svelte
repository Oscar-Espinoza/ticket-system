<!--
  Two-pane inbox. State is local and optimistic (server actions confirm in the
  background); a refresh — or any fresh server load — re-seeds it.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import Archive from '@lucide/svelte/icons/archive';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import InboxIcon from '@lucide/svelte/icons/inbox';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import {
    archiveNotifications,
    archiveReadNotifications,
    markAllNotificationsRead,
    markNotificationsRead,
    snoozeNotifications,
    type ActionResult,
  } from '@/lib/actions/notifications';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { issuePath } from '@/lib/issue-links';
  import type { InboxNotification } from '@/lib/notifications/inbox';
  import { INBOX_CHANGED_EVENT } from '@/lib/notifications/types';
  import { cn } from '@/lib/utils';
  import { formatWhen } from '@/lib/components/inbox/when-options';
  import InboxDetail from './inbox-detail.svelte';
  import { byNewest, groupNotifications, type InboxGroup } from './inbox-groups';
  import NotificationGlyph, { notificationSentence } from './notification-glyph.svelte';

  type Filter = 'all' | 'unread';

  let {
    notifications,
    issues,
  }: {
    notifications: InboxNotification[];
    issues: IssueRow[];
  } = $props();

  // Local optimistic copy, re-seeded whenever the server list changes.
  let items = $derived(notifications);
  let filter = $state<Filter>('all');
  let selectedKey = $state<string | null>(null);
  const rowRefs = new Map<string, HTMLButtonElement>();

  const issueById = $derived(new Map(issues.map((issue) => [issue.id, issue])));
  const groups = $derived(groupNotifications(items));
  // The open group stays listed under "Unread" after opening marks it read.
  const visible = $derived(
    filter === 'unread' ? groups.filter((g) => g.unread || g.key === selectedKey) : groups,
  );
  const selected = $derived(visible.find((g) => g.key === selectedKey) ?? null);
  const issueOf = (group: InboxGroup) =>
    group.ticketId ? (issueById.get(group.ticketId) ?? null) : null;
  const unreadCount = $derived(groups.filter((g) => g.unread).length);

  async function run(action: () => Promise<ActionResult>) {
    const result = await action().catch(() => ({ ok: false as const, error: 'Something went wrong' }));
    if (!result.ok) {
      toast.error(result.error);
      void refreshAfterWrite();
    }
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
  }

  function setRead(group: InboxGroup, read: boolean) {
    const ids = group.items.filter((n) => !n.readAt === read).map((n) => n.id);
    if (ids.length === 0) return;
    const readAt = read ? new Date() : null;
    const changed = new Set(ids);
    items = items.map((n) => (changed.has(n.id) ? { ...n, readAt } : n));
    void run(() => markNotificationsRead({ ids, read }));
  }

  function select(group: InboxGroup | null, focus = false) {
    selectedKey = group?.key ?? null;
    if (!group) return;
    if (group.unread) setRead(group, true);
    if (focus) {
      const row = rowRefs.get(group.key);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Drop a group from the list and open its neighbour (archive / snooze). */
  function removeGroup(group: InboxGroup) {
    const index = visible.findIndex((g) => g.key === group.key);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    const ids = new Set(group.items.map((n) => n.id));
    const wasSelected = selectedKey === group.key;
    items = items.filter((n) => !ids.has(n.id));
    if (wasSelected) select(next, true);
  }

  function restoreGroup(restored: InboxNotification[]) {
    const present = new Set(items.map((n) => n.id));
    items = [...items, ...restored.filter((n) => !present.has(n.id))].sort(byNewest);
  }

  function archive(group: InboxGroup) {
    const ids = group.items.map((n) => n.id);
    removeGroup(group);
    void run(() => archiveNotifications({ ids, archived: true }));
    toast('Archived', {
      action: {
        label: 'Undo',
        onClick: () => {
          restoreGroup(group.items);
          void run(() => archiveNotifications({ ids, archived: false }));
        },
      },
    });
  }

  function snooze(group: InboxGroup, until: Date) {
    const ids = group.items.map((n) => n.id);
    removeGroup(group);
    void run(() => snoozeNotifications({ ids, until: until.toISOString() }));
    toast(`Snoozed until ${formatWhen(until)}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          // The snooze already marked them unread on the server.
          restoreGroup(group.items.map((n) => ({ ...n, readAt: null })));
          void run(() => snoozeNotifications({ ids, until: null }));
        },
      },
    });
  }

  function markAllRead() {
    const readAt = new Date();
    items = items.map((n) => (n.readAt ? n : { ...n, readAt }));
    void run(markAllNotificationsRead);
  }

  function archiveAllRead() {
    const remaining = items.filter((n) => !n.readAt);
    if (remaining.length === items.length) {
      toast('Nothing read to archive');
      return;
    }
    items = remaining;
    if (selectedKey && !remaining.some((n) => (n.ticketId ?? n.id) === selectedKey)) {
      selectedKey = null;
    }
    void (async () => {
      const result = await archiveReadNotifications().catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? 'Something went wrong');
        void refreshAfterWrite();
      } else {
        toast(`Archived ${result.count} read notification${result.count === 1 ? '' : 's'}`);
      }
    })();
  }

  // Hotkeys — handlers read the latest state when they fire (useEffectEvent).
  function move(delta: 1 | -1) {
    if (visible.length === 0) return;
    const index = visible.findIndex((g) => g.key === selectedKey);
    const next =
      index === -1
        ? delta === 1
          ? 0
          : visible.length - 1
        : Math.min(visible.length - 1, Math.max(0, index + delta));
    select(visible[next], true);
  }

  $effect(() =>
    registerHotkeys([
      { key: 'j', scope: 'Inbox', description: 'Next notification', handler: () => move(1) },
      { key: 'k', scope: 'Inbox', description: 'Previous notification', handler: () => move(-1) },
      {
        key: 'Enter',
        scope: 'Inbox',
        description: 'Open issue',
        // Only from a row (or nothing focused) — Enter on a toolbar button keeps its own meaning.
        when: (event) =>
          event.target === document.body ||
          (event.target instanceof HTMLElement && event.target.hasAttribute('data-inbox-row')),
        handler: () => {
          const issue = selected && issueOf(selected);
          if (issue) void goto(issuePath(issue.projectId, issue.key));
        },
      },
      {
        key: 'u',
        scope: 'Inbox',
        description: 'Mark as read / unread',
        handler: () => {
          if (selected) setRead(selected, selected.unread);
        },
      },
      {
        key: 'e',
        scope: 'Inbox',
        description: 'Archive notification',
        handler: () => {
          if (selected) archive(selected);
        },
      },
    ]),
  );

  const rowRef = (key: string) => (el: HTMLButtonElement) => {
    rowRefs.set(key, el);
    return () => {
      if (rowRefs.get(key) === el) rowRefs.delete(key);
    };
  };
</script>

{#snippet inboxRow(group: InboxGroup, issue: IssueRow | null, active: boolean)}
  {@const latest = group.latest}
  {@const key = issue?.key ?? latest.data.key}
  {@const title = issue?.title ?? latest.data.title ?? 'Notification'}
  <button
    {@attach rowRef(group.key)}
    type="button"
    data-inbox-row={group.key}
    aria-current={active ? 'true' : undefined}
    onclick={() => select(group)}
    class={cn(
      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors',
      'focus-visible:ring-3 focus-visible:ring-ring/50',
      active ? 'bg-accent' : 'hover:bg-accent/50',
    )}
  >
    <span
      aria-label={group.unread ? 'Unread' : undefined}
      class={cn('size-1.5 shrink-0 rounded-full', group.unread ? 'bg-primary' : 'bg-transparent')}
    ></span>
    <NotificationGlyph notification={latest} />
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex min-w-0 items-baseline gap-1.5 text-sm">
        {#if key}<span class="shrink-0 font-mono text-xs text-muted-foreground">{key}</span>{/if}
        <span class={cn('truncate', group.unread && 'font-medium')}>{title}</span>
      </span>
      <span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span class="truncate">
          {notificationSentence(latest)}{group.items.length > 1 ? ` · +${group.items.length - 1}` : ''}
        </span>
        <span class="ml-auto shrink-0 tabular-nums">{relativeTime(latest.at)}</span>
      </span>
    </span>
  </button>
{/snippet}

{#snippet inboxIcon()}<InboxIcon />{/snippet}

<div class="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] sm:-mx-6 sm:-my-8">
  <section
    aria-label="Notifications"
    class={cn(
      'flex w-full min-w-0 flex-col border-border md:w-[380px] md:shrink-0 md:border-r',
      selected && 'hidden md:flex',
    )}
  >
    <div class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <h1 class="text-sm font-medium">Inbox</h1>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={0}
        bind:value={() => filter, (value) => value && (filter = value as Filter)}
        aria-label="Filter notifications"
        class="ml-2"
      >
        <ToggleGroupItem value="all" class="h-6 px-2 text-xs">All</ToggleGroupItem>
        <ToggleGroupItem value="unread" class="h-6 px-2 text-xs">
          Unread{#if unreadCount > 0}<span class="tabular-nums text-muted-foreground">{unreadCount}</span>{/if}
        </ToggleGroupItem>
      </ToggleGroup>
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" class="ml-auto" aria-label="Inbox actions">
              <Ellipsis />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-52">
          <DropdownMenuItem onSelect={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck />
            Mark all as read
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={archiveAllRead}>
            <Archive />
            Archive all read
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if visible.length === 0}
        <EmptyState
          icon={inboxIcon}
          title={filter === 'unread' ? 'No unread notifications' : 'Inbox zero'}
          description={filter === 'unread'
            ? 'You are all caught up.'
            : 'Assignments, mentions, comments and status changes on issues you follow show up here.'}
          class="py-24"
        />
      {:else}
        <ul class="flex flex-col p-1">
          {#each visible as group (group.key)}
            <li>{@render inboxRow(group, issueOf(group), group.key === selectedKey)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>

  <section
    aria-label="Notification details"
    class={cn('min-w-0 flex-1 overflow-y-auto', !selected && 'hidden md:block')}
  >
    {#if selected}
      {#key selected.key}
        <InboxDetail
          group={selected}
          issue={issueOf(selected)}
          onToggleRead={() => selected && setRead(selected, selected.unread)}
          onArchive={() => selected && archive(selected)}
          onSnooze={(until) => selected && snooze(selected, until)}
          onBack={() => (selectedKey = null)}
        />
      {/key}
    {:else if visible.length > 0}
      <EmptyState
        icon={inboxIcon}
        title="No notification selected"
        description="Pick one from the list, or use J / K to move and U / E to mark read or archive."
        class="h-full"
      />
    {/if}
  </section>
</div>
