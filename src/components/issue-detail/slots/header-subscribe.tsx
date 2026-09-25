'use client';

// Owner: B1. Subscribe / unsubscribe (bell) with the subscriber list.

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';

import { getIssueSubscribers, setSubscribed } from '@/app/actions/subscriptions';
import { isPendingIssue, type IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectData } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar } from '@/components/ui-icons';
import type { IssueRow, IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

type State = { issueId: string; subscribers: IssueUser[] };

export function HeaderSubscribe({ issue }: { issue: IssueRow; mutations: IssueMutations }) {
  const { viewer } = useProjectData();
  const [state, setState] = useState<State | null>(null);
  const [pending, setPending] = useState(false);
  const pendingIssue = isPendingIssue(issue);
  const updatedAt = new Date(issue.updatedAt).getTime();

  // Refetch on updatedAt too: assigning someone auto-subscribes them.
  useEffect(() => {
    if (pendingIssue) return;
    let cancelled = false;
    getIssueSubscribers({ projectId: issue.projectId, ticketId: issue.id })
      .then((result) => {
        if (!cancelled && result.ok) setState({ issueId: issue.id, subscribers: result.subscribers });
      })
      .catch(() => {
        // The bell just stays in its last known state.
      });
    return () => {
      cancelled = true;
    };
  }, [issue.id, issue.projectId, updatedAt, pendingIssue]);

  if (pendingIssue) return null;
  const subscribers = state?.issueId === issue.id ? state.subscribers : null;
  const subscribed = subscribers?.some((s) => s.id === viewer.id) ?? false;

  async function toggle() {
    if (!subscribers) return;
    const issueId = issue.id;
    const next = !subscribed;
    const previous = subscribers;
    const me: IssueUser = { id: viewer.id, name: viewer.name, image: viewer.image };
    setState({
      issueId,
      subscribers: next ? [...previous, me] : previous.filter((s) => s.id !== viewer.id),
    });
    setPending(true);
    try {
      const result = await setSubscribed({ projectId: issue.projectId, ticketId: issueId, subscribed: next });
      if (!result.ok) throw new Error(result.error);
    } catch {
      setState((current) => (current?.issueId === issueId ? { issueId, subscribers: previous } : current));
      toast.error(next ? 'Could not subscribe to this issue.' : 'Could not unsubscribe from this issue.');
    } finally {
      setPending(false);
    }
  }

  const ordered = subscribers
    ? [...subscribers].sort((a, b) => Number(b.id === viewer.id) - Number(a.id === viewer.id))
    : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={subscribed ? 'Subscribed — manage subscription' : 'Not subscribed — manage subscription'}
          className={cn(subscribed && 'text-foreground')}
        >
          <Bell className={cn(subscribed && 'fill-current')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-2 p-2">
        <Button
          size="sm"
          variant={subscribed ? 'outline' : 'default'}
          disabled={!subscribers || pending}
          onClick={toggle}
          className="w-full"
        >
          {subscribed ? <BellOff /> : <Bell />}
          {subscribed ? 'Unsubscribe' : 'Subscribe'}
        </Button>
        <p className="px-1 text-xs text-muted-foreground">
          {subscribers === null
            ? 'Loading subscribers…'
            : subscribers.length === 0
              ? 'No one is subscribed to this issue.'
              : `${subscribers.length} ${subscribers.length === 1 ? 'subscriber' : 'subscribers'}`}
        </p>
        {ordered.length > 0 && (
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {ordered.map((user) => (
              <li key={user.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                <Avatar name={user.name} src={user.image} size={20} />
                <span className="truncate">{user.name}</span>
                {user.id === viewer.id && <span className="ml-auto text-xs text-muted-foreground">You</span>}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
