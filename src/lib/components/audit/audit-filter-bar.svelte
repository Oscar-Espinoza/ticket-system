<!--
  Audit log filters (actor, category, date range, issue key) mirrored to the
  URL — the server load re-queries on every change — plus CSV / JSON export
  links carrying the same filters.
-->
<script module lang="ts">
  export interface AuditActorOption {
    id: string;
    name: string;
    image: string | null;
  }
</script>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import XIcon from '@lucide/svelte/icons/x';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { Avatar } from '@/lib/components/ui-icons';

  let {
    actors,
    categories,
    systemActor,
    exportHref,
  }: {
    actors: AuditActorOption[];
    categories: { value: string; label: string }[];
    /** Sentinel value for "no user" (integrations, automations). */
    systemActor: string;
    /** `/api/audit?…` with the current filters, without `format`. */
    exportHref: string;
  } = $props();

  const ALL = 'all';
  const SYSTEM_LABEL = 'System & integrations';

  // Navigations in flight: a superseded goto resolves early, so a single flag
  // would hide the spinner while the newer one still loads (useTransition
  // stays pending until every queued transition finishes).
  let inFlight = $state(0);
  const pending = $derived(inFlight > 0);
  // svelte-ignore state_referenced_locally
  let issue = $state(page.url.searchParams.get('issue') ?? '');

  const value = (name: string) => page.url.searchParams.get(name) ?? '';
  const active = $derived(['actor', 'category', 'from', 'to', 'issue'].some((name) => value(name)));

  const actorItems = $derived([
    { value: ALL, label: 'Anyone' },
    { value: systemActor, label: SYSTEM_LABEL },
    ...actors.map((actor) => ({ value: actor.id, label: actor.name })),
  ]);
  const categoryItems = $derived([{ value: ALL, label: 'All events' }, ...categories]);
  const selectedActor = $derived(actors.find((actor) => actor.id === value('actor')));

  async function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(page.url.searchParams.toString());
    for (const [name, v] of Object.entries(changes)) {
      if (v) next.set(name, v);
      else next.delete(name);
    }
    // New filters start from the newest page.
    next.delete('before');
    const query = next.toString();
    const pathname = page.url.pathname;
    inFlight += 1;
    try {
      // router.replace(…, { scroll: false }): replace the entry, keep scroll and focus.
      await goto(query ? `${pathname}?${query}` : pathname, { replace: true, reset: false });
    } finally {
      inFlight -= 1;
    }
  }

  function applyIssue() {
    const key = issue.trim().toUpperCase();
    if (key !== value('issue')) void update({ issue: key || null });
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <Select
    items={actorItems}
    bind:value={() => value('actor') || ALL, (v) => update({ actor: v === ALL ? null : v })}
  >
    <SelectTrigger size="sm" class="min-w-36" aria-label="Actor">
      <SelectValue placeholder="Anyone">
        {#snippet children()}
          {#if selectedActor}
            <Avatar name={selectedActor.name} src={selectedActor.image} size={20} />
            {selectedActor.name}
          {:else}
            {actorItems.find((item) => item.value === (value('actor') || ALL))?.label ?? ''}
          {/if}
        {/snippet}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>Anyone</SelectItem>
      <SelectItem value={systemActor}>{SYSTEM_LABEL}</SelectItem>
      {#if actors.length > 0}<SelectSeparator />{/if}
      {#each actors as actor (actor.id)}
        <SelectItem value={actor.id} label={actor.name}>
          <Avatar name={actor.name} src={actor.image} size={20} />
          {actor.name}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>

  <Select
    items={categoryItems}
    bind:value={() => value('category') || ALL, (v) => update({ category: v === ALL ? null : v })}
  >
    <SelectTrigger size="sm" class="min-w-36" aria-label="Event type">
      <SelectValue placeholder="All events" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>All events</SelectItem>
      <SelectSeparator />
      {#each categories as category (category.value)}
        <SelectItem value={category.value}>{category.label}</SelectItem>
      {/each}
    </SelectContent>
  </Select>

  <div class="flex items-center gap-1">
    <Input
      type="date"
      aria-label="From date"
      class="h-7 w-36 text-xs"
      value={value('from')}
      max={value('to') || undefined}
      oninput={(e) => update({ from: e.currentTarget.value || null })}
    />
    <span class="text-xs text-muted-foreground">–</span>
    <Input
      type="date"
      aria-label="To date"
      class="h-7 w-36 text-xs"
      value={value('to')}
      min={value('from') || undefined}
      oninput={(e) => update({ to: e.currentTarget.value || null })}
    />
  </div>

  <Input
    aria-label="Issue key"
    placeholder="Issue, e.g. APP-12"
    class="h-7 w-36 font-mono text-xs"
    bind:value={issue}
    onblur={applyIssue}
    onkeydown={(e) => {
      if (e.key === 'Enter') applyIssue();
    }}
  />

  {#if active}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => {
        issue = '';
        void update({ actor: null, category: null, from: null, to: null, issue: null });
      }}
    >
      <XIcon />
      Clear
    </Button>
  {/if}
  {#if pending}
    <LoaderCircleIcon aria-label="Loading" class="size-3.5 animate-spin text-muted-foreground" />
  {/if}

  <div class="ml-auto flex items-center gap-1">
    <Button variant="outline" size="sm" href="{exportHref}&format=csv" download data-sveltekit-reload>
      <DownloadIcon />
      CSV
    </Button>
    <Button variant="outline" size="sm" href="{exportHref}&format=json" download data-sveltekit-reload>
      <DownloadIcon />
      JSON
    </Button>
  </div>
</div>
