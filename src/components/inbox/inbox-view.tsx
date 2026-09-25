'use client';

// Two-pane inbox. State is local and optimistic (server actions confirm in the
// background); a router.refresh() — or any fresh server render — re-seeds it.

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, CheckCheck, Inbox, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/components/ui-icons';
import { relativeTime } from '@/components/issues/issue-properties';
import {
  archiveNotifications,
  archiveReadNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  snoozeNotifications,
  type ActionResult,
} from '@/app/actions/notifications';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueRow } from '@/lib/issue-model';
import { issuePath } from '@/lib/issue-links';
import type { InboxNotification } from '@/lib/notifications/inbox';
import { INBOX_CHANGED_EVENT } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';
import { InboxDetail } from './inbox-detail';
import { byNewest, groupNotifications, type InboxGroup } from './inbox-groups';
import { NotificationGlyph, notificationSentence } from './notification-glyph';
import { formatWhen } from './when-options';

type Filter = 'all' | 'unread';

export function InboxView({
  notifications,
  issues,
}: {
  notifications: InboxNotification[];
  issues: IssueRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [seed, setSeed] = useState(notifications);
  if (seed !== notifications) {
    setSeed(notifications);
    setItems(notifications);
  }
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const issueById = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
  const groups = useMemo(() => groupNotifications(items), [items]);
  // The open group stays listed under "Unread" after opening marks it read.
  const visible =
    filter === 'unread' ? groups.filter((g) => g.unread || g.key === selectedKey) : groups;
  const selected = visible.find((g) => g.key === selectedKey) ?? null;
  const issueOf = (group: InboxGroup) => (group.ticketId ? (issueById.get(group.ticketId) ?? null) : null);
  const unreadCount = groups.filter((g) => g.unread).length;

  const run = async (action: () => Promise<ActionResult>) => {
    const result = await action().catch(() => ({ ok: false as const, error: 'Something went wrong' }));
    if (!result.ok) {
      toast.error(result.error);
      router.refresh();
    }
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
  };

  const setRead = (group: InboxGroup, read: boolean) => {
    const ids = group.items.filter((n) => !n.readAt === read).map((n) => n.id);
    if (ids.length === 0) return;
    const readAt = read ? new Date() : null;
    const changed = new Set(ids);
    setItems((prev) => prev.map((n) => (changed.has(n.id) ? { ...n, readAt } : n)));
    void run(() => markNotificationsRead({ ids, read }));
  };

  const select = (group: InboxGroup | null, focus = false) => {
    setSelectedKey(group?.key ?? null);
    if (!group) return;
    if (group.unread) setRead(group, true);
    if (focus) {
      const row = rowRefs.current.get(group.key);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    }
  };

  /** Drop a group from the list and open its neighbour (archive / snooze). */
  const removeGroup = (group: InboxGroup) => {
    const index = visible.findIndex((g) => g.key === group.key);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    const ids = new Set(group.items.map((n) => n.id));
    setItems((prev) => prev.filter((n) => !ids.has(n.id)));
    if (selectedKey === group.key) select(next, true);
  };

  const restoreGroup = (restored: InboxNotification[]) =>
    setItems((prev) => {
      const present = new Set(prev.map((n) => n.id));
      return [...prev, ...restored.filter((n) => !present.has(n.id))].sort(byNewest);
    });

  const archive = (group: InboxGroup) => {
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
  };

  const snooze = (group: InboxGroup, until: Date) => {
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
  };

  const markAllRead = () => {
    const readAt = new Date();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));
    void run(markAllNotificationsRead);
  };

  const archiveAllRead = () => {
    const remaining = items.filter((n) => !n.readAt);
    if (remaining.length === items.length) {
      toast('Nothing read to archive');
      return;
    }
    setItems(remaining);
    if (selectedKey && !remaining.some((n) => (n.ticketId ?? n.id) === selectedKey)) {
      setSelectedKey(null);
    }
    void (async () => {
      const result = await archiveReadNotifications().catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? 'Something went wrong');
        router.refresh();
      } else {
        toast(`Archived ${result.count} read notification${result.count === 1 ? '' : 's'}`);
      }
    })();
  };

  // Hotkeys — handlers read the latest render through effect events.
  const move = useEffectEvent((delta: 1 | -1) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((g) => g.key === selectedKey);
    const next =
      index === -1
        ? delta === 1
          ? 0
          : visible.length - 1
        : Math.min(visible.length - 1, Math.max(0, index + delta));
    select(visible[next], true);
  });
  const openSelected = useEffectEvent(() => {
    const issue = selected && issueOf(selected);
    if (issue) router.push(issuePath(issue.projectId, issue.key));
  });
  const toggleSelected = useEffectEvent(() => {
    if (selected) setRead(selected, !selected.unread);
  });
  const archiveSelected = useEffectEvent(() => {
    if (selected) archive(selected);
  });

  useEffect(
    () =>
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
          handler: () => openSelected(),
        },
        { key: 'u', scope: 'Inbox', description: 'Mark as read / unread', handler: () => toggleSelected() },
        { key: 'e', scope: 'Inbox', description: 'Archive notification', handler: () => archiveSelected() },
      ]),
    [],
  );

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] sm:-mx-6 sm:-my-8">
      <section
        aria-label="Notifications"
        className={cn(
          'flex w-full min-w-0 flex-col border-border md:w-[380px] md:shrink-0 md:border-r',
          selected && 'hidden md:flex',
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <h1 className="text-sm font-medium">Inbox</h1>
          <ToggleGroup
            type="single"
            size="sm"
            spacing={0}
            value={filter}
            onValueChange={(value) => value && setFilter(value as Filter)}
            aria-label="Filter notifications"
            className="ml-2"
          >
            <ToggleGroupItem value="all" className="h-6 px-2 text-xs">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="unread" className="h-6 px-2 text-xs">
              Unread{unreadCount > 0 && <span className="tabular-nums text-muted-foreground">{unreadCount}</span>}
            </ToggleGroupItem>
          </ToggleGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Inbox actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={filter === 'unread' ? 'No unread notifications' : 'Inbox zero'}
              description={
                filter === 'unread'
                  ? 'You are all caught up.'
                  : 'Assignments, mentions, comments and status changes on issues you follow show up here.'
              }
              className="py-24"
            />
          ) : (
            <ul className="flex flex-col p-1">
              {visible.map((group) => (
                <li key={group.key}>
                  <InboxRow
                    ref={(el) => {
                      if (el) rowRefs.current.set(group.key, el);
                      else rowRefs.current.delete(group.key);
                    }}
                    group={group}
                    issue={issueOf(group)}
                    active={group.key === selectedKey}
                    onSelect={() => select(group)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        aria-label="Notification details"
        className={cn('min-w-0 flex-1 overflow-y-auto', !selected && 'hidden md:block')}
      >
        {selected ? (
          <InboxDetail
            key={selected.key}
            group={selected}
            issue={issueOf(selected)}
            onToggleRead={() => setRead(selected, !selected.unread)}
            onArchive={() => archive(selected)}
            onSnooze={(until) => snooze(selected, until)}
            onBack={() => setSelectedKey(null)}
          />
        ) : (
          visible.length > 0 && (
            <EmptyState
              icon={<Inbox />}
              title="No notification selected"
              description="Pick one from the list, or use J / K to move and U / E to mark read or archive."
              className="h-full"
            />
          )
        )}
      </section>
    </div>
  );
}

function InboxRow({
  ref,
  group,
  issue,
  active,
  onSelect,
}: {
  ref: (el: HTMLButtonElement | null) => void;
  group: InboxGroup;
  issue: IssueRow | null;
  active: boolean;
  onSelect: () => void;
}) {
  const { latest } = group;
  const key = issue?.key ?? latest.data.key;
  const title = issue?.title ?? latest.data.title ?? 'Notification';
  return (
    <button
      ref={ref}
      type="button"
      data-inbox-row={group.key}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors',
        'focus-visible:ring-3 focus-visible:ring-ring/50',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <span
        aria-label={group.unread ? 'Unread' : undefined}
        className={cn('size-1.5 shrink-0 rounded-full', group.unread ? 'bg-primary' : 'bg-transparent')}
      />
      <NotificationGlyph notification={latest} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
          {key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{key}</span>}
          <span className={cn('truncate', group.unread && 'font-medium')}>{title}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {notificationSentence(latest)}
            {group.items.length > 1 && ` · +${group.items.length - 1}`}
          </span>
          <span className="ml-auto shrink-0 tabular-nums" suppressHydrationWarning>
            {relativeTime(latest.at)}
          </span>
        </span>
      </span>
    </button>
  );
}
