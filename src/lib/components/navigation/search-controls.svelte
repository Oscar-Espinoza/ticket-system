<!--
  Search input + filters. Everything lives in the URL (q, project, archived) so
  results are server-rendered and shareable; typing replaces the URL after a
  short pause instead of on every key. `q` may carry filter syntax
  (label:bug assignee:me …) — see the "?" popover.
-->
<script module lang="ts">
  const ALL = '__all';
  const DEBOUNCE_MS = 250;

  /** Appends `token` to `query` with a separating space (appendToken in views/search-syntax-help). */
  function appendToken(query: string, token: string): string {
    const base = query.trimEnd();
    return base ? `${base} ${token} ` : `${token} `;
  }
</script>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import SearchIcon from '@lucide/svelte/icons/search';

  import { InputGroup, InputGroupAddon, InputGroupInput } from '@/lib/components/ui/input-group';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Switch } from '@/lib/components/ui/switch';
  import SearchSyntaxHelp from '@/lib/components/views/search-syntax-help.svelte';
  import { createDebouncer } from '@/lib/svelte/debounce';
  import SearchTermChips from '@/lib/components/views/search-term-chips.svelte';

  let {
    query,
    projectId,
    includeArchived,
    projects,
  }: {
    query: string;
    projectId: string | null;
    includeArchived: boolean;
    projects: { id: string; name: string }[];
  } = $props();

  // useState(query): the box keeps what the user typed across URL updates.
  // svelte-ignore state_referenced_locally
  let text = $state(query);
  const debounce = createDebouncer();
  let inputRef = $state<HTMLInputElement | null>(null);

  // useTransition around router.replace: pending until the latest navigation lands.
  let running = 0;
  let pending = $state(false);

  $effect(() => debounce.cancel);

  const projectItems = $derived([
    { value: ALL, label: 'All projects' },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ]);

  async function navigate(next: { q?: string; project?: string | null; archived?: boolean }) {
    const params = new URLSearchParams();
    const q = (next.q ?? text).trim();
    const project = next.project === undefined ? projectId : next.project;
    const archived = next.archived ?? includeArchived;
    if (q) params.set('q', q);
    if (project) params.set('project', project);
    if (archived) params.set('archived', '1');
    const search = params.toString();
    const pathname = page.url.pathname;
    running += 1;
    pending = true;
    try {
      // router.replace: no new history entry; keep focus (typing) and scroll.
      await goto(search ? `${pathname}?${search}` : pathname, { replace: true, reset: false });
    } finally {
      running -= 1;
      if (running === 0) pending = false;
    }
  }

  function onType(value: string) {
    text = value;
    debounce.schedule(() => void navigate({ q: value }), DEBOUNCE_MS);
  }
</script>

<div class="flex flex-col gap-3">
  <form
    role="search"
    onsubmit={(event) => {
      event.preventDefault();
      debounce.cancel();
      void navigate({ q: text });
    }}
  >
    <InputGroup class="h-10">
      <InputGroupAddon>
        {#if pending}<Loader2Icon class="animate-spin" />{:else}<SearchIcon />{/if}
      </InputGroupAddon>
      <!-- svelte-ignore a11y_autofocus -->
      <InputGroupInput
        type="search"
        name="q"
        aria-label="Search issues"
        bind:ref={inputRef}
        placeholder="Search issues and comments — try label:bug assignee:me, or a key like APP-12"
        autofocus
        autocomplete="off"
        bind:value={() => text, (v) => onType(String(v ?? ''))}
        onkeydown={(event) => {
          if (event.key === 'Escape' && text) {
            event.preventDefault();
            onType('');
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <SearchSyntaxHelp
          note="Free text matches titles, descriptions and comments."
          onInsert={(token: string) => {
            onType(appendToken(text, token));
            inputRef?.focus();
          }}
        />
      </InputGroupAddon>
    </InputGroup>
  </form>
  <SearchTermChips {query} />

  <div class="flex flex-wrap items-center gap-4">
    <Select
      items={projectItems}
      bind:value={() => projectId ?? ALL, (value) => void navigate({ project: value === ALL ? null : value })}
    >
      <SelectTrigger size="sm" aria-label="Project" class="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All projects</SelectItem>
        {#each projects as project (project.id)}
          <SelectItem value={project.id}>{project.name}</SelectItem>
        {/each}
      </SelectContent>
    </Select>

    <div class="flex items-center gap-2">
      <Switch
        id="search-archived"
        size="sm"
        bind:checked={() => includeArchived, (checked) => void navigate({ archived: checked })}
      />
      <Label for="search-archived" class="text-xs font-normal text-muted-foreground">Include archived</Label>
    </div>
  </div>
</div>
