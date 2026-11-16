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
  import { m } from '@/lib/i18n';
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
  const systemLabel = $derived(m.settings_audit_system());

  // Navigations in flight: a superseded goto resolves early, so a single flag
  // would hide the spinner while the newer one still loads (the pending flag
  // stays set until every queued navigation finishes).
  let inFlight = $state(0);
  const pending = $derived(inFlight > 0);
  // svelte-ignore state_referenced_locally
  let issue = $state(page.url.searchParams.get('issue') ?? '');

  const value = (name: string) => page.url.searchParams.get(name) ?? '';
  const active = $derived(['actor', 'category', 'from', 'to', 'issue'].some((name) => value(name)));

  const actorItems = $derived([
    { value: ALL, label: m.settings_audit_anyone() },
    { value: systemActor, label: systemLabel },
    ...actors.map((actor) => ({ value: actor.id, label: actor.name })),
  ]);
  const categoryItems = $derived([{ value: ALL, label: m.settings_audit_all_events() }, ...categories]);
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
      // Replace the history entry, keep scroll and focus.
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
    <SelectTrigger size="sm" class="min-w-36" aria-label={m.settings_audit_actor()}>
      <SelectValue placeholder={m.settings_audit_anyone()}>
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
      <SelectItem value={ALL}>{m.settings_audit_anyone()}</SelectItem>
      <SelectItem value={systemActor}>{systemLabel}</SelectItem>
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
    <SelectTrigger size="sm" class="min-w-36" aria-label={m.settings_audit_event_type()}>
      <SelectValue placeholder={m.settings_audit_all_events()} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>{m.settings_audit_all_events()}</SelectItem>
      <SelectSeparator />
      {#each categories as category (category.value)}
        <SelectItem value={category.value}>{category.label}</SelectItem>
      {/each}
    </SelectContent>
  </Select>

  <div class="flex items-center gap-1">
    <Input
      type="date"
      aria-label={m.settings_audit_from_date()}
      class="h-7 w-36 text-xs"
      value={value('from')}
      max={value('to') || undefined}
      oninput={(e) => update({ from: e.currentTarget.value || null })}
    />
    <span class="text-xs text-muted-foreground">–</span>
    <Input
      type="date"
      aria-label={m.settings_audit_to_date()}
      class="h-7 w-36 text-xs"
      value={value('to')}
      min={value('from') || undefined}
      oninput={(e) => update({ to: e.currentTarget.value || null })}
    />
  </div>

  <Input
    aria-label={m.settings_audit_issue_key()}
    placeholder={m.settings_audit_issue_placeholder()}
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
      {m.settings_audit_clear()}
    </Button>
  {/if}
  {#if pending}
    <LoaderCircleIcon aria-label={m.settings_audit_loading()} class="size-3.5 animate-spin text-muted-foreground" />
  {/if}

  <div class="ml-auto flex items-center gap-1">
    <Button variant="outline" size="sm" href="{exportHref}&format=csv" download data-sveltekit-reload>
      <DownloadIcon />
      CSV <!-- i18n-ignore -->
    </Button>
    <Button variant="outline" size="sm" href="{exportHref}&format=json" download data-sveltekit-reload>
      <DownloadIcon />
      JSON <!-- i18n-ignore -->
    </Button>
  </div>
</div>
