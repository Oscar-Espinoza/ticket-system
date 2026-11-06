<!-- Subscribe / unsubscribe (bell) with the subscriber list. -->
<script lang="ts">
  import BellIcon from '@lucide/svelte/icons/bell';
  import BellOffIcon from '@lucide/svelte/icons/bell-off';
  import { toast } from 'svelte-sonner';

  import { getIssueSubscribers, setSubscribed } from '@/lib/actions/subscriptions';
  import { isPendingIssue, type IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { Avatar } from '@/lib/components/ui-icons';
  import type { IssueRow, IssueUser } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';

  type State = { issueId: string; subscribers: IssueUser[] };

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const data = useProjectData();
  let loaded = $state.raw<State | null>(null);
  let pending = $state(false);
  const pendingIssue = $derived(isPendingIssue(issue));
  const updatedAt = $derived(new Date(issue.updatedAt).getTime());

  // Refetch on updatedAt too: assigning someone auto-subscribes them.
  $effect(() => {
    if (pendingIssue) return;
    const issueId = issue.id;
    const projectId = issue.projectId;
    void updatedAt;
    let cancelled = false;
    getIssueSubscribers({ projectId, ticketId: issueId })
      .then((result) => {
        if (!cancelled && result.ok) loaded = { issueId, subscribers: result.subscribers };
      })
      .catch(() => {
        // The bell just stays in its last known state.
      });
    return () => {
      cancelled = true;
    };
  });

  const subscribers = $derived(loaded?.issueId === issue.id ? loaded.subscribers : null);
  const subscribed = $derived(subscribers?.some((s) => s.id === data.viewer.id) ?? false);

  async function toggle() {
    if (!subscribers) return;
    const issueId = issue.id;
    const next = !subscribed;
    const previous = subscribers;
    const viewer = data.viewer;
    const me: IssueUser = { id: viewer.id, name: viewer.name, image: viewer.image };
    loaded = {
      issueId,
      subscribers: next ? [...previous, me] : previous.filter((s) => s.id !== viewer.id),
    };
    pending = true;
    try {
      const result = await setSubscribed({ projectId: issue.projectId, ticketId: issueId, subscribed: next });
      if (!result.ok) throw new Error(result.error);
    } catch {
      if (loaded?.issueId === issueId) loaded = { issueId, subscribers: previous };
      toast.error(next ? 'Could not subscribe to this issue.' : 'Could not unsubscribe from this issue.');
    } finally {
      pending = false;
    }
  }

  const ordered = $derived(
    subscribers
      ? [...subscribers].sort((a, b) => Number(b.id === data.viewer.id) - Number(a.id === data.viewer.id))
      : [],
  );
</script>

{#if !pendingIssue}
  <Popover>
    <PopoverTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-sm"
          aria-label={subscribed ? 'Subscribed — manage subscription' : 'Not subscribed — manage subscription'}
          class={cn(subscribed && 'text-foreground')}
        >
          <BellIcon class={cn(subscribed && 'fill-current')} />
        </Button>
      {/snippet}
    </PopoverTrigger>
    <PopoverContent align="end" class="w-64 gap-2 p-2">
      <Button
        size="sm"
        variant={subscribed ? 'outline' : 'default'}
        disabled={!subscribers || pending}
        onclick={() => void toggle()}
        class="w-full"
      >
        {#if subscribed}<BellOffIcon />{:else}<BellIcon />{/if}
        {subscribed ? 'Unsubscribe' : 'Subscribe'}
      </Button>
      <p class="px-1 text-xs text-muted-foreground">
        {subscribers === null
          ? 'Loading subscribers…'
          : subscribers.length === 0
            ? 'No one is subscribed to this issue.'
            : `${subscribers.length} ${subscribers.length === 1 ? 'subscriber' : 'subscribers'}`}
      </p>
      {#if ordered.length > 0}
        <ul class="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {#each ordered as user (user.id)}
            <li class="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
              <Avatar name={user.name} src={user.image} size={20} />
              <span class="truncate">{user.name}</span>
              {#if user.id === data.viewer.id}<span class="ml-auto text-xs text-muted-foreground">You</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </PopoverContent>
  </Popover>
{/if}
