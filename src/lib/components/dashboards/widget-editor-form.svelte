<!-- Form half of widget-editor.svelte (one instance per edited widget). -->
<script lang="ts">
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import ProjectDataProvider from '@/lib/components/project/project-data-provider.svelte';
  import SearchSyntaxHelp from '@/lib/components/views/search-syntax-help.svelte';
  import { appendToken } from '@/lib/search-token';
  import { normalizeIssueFilters } from '@/lib/issue-filtering';
  import { widgetIssues, widgetProjects } from '@/lib/components/dashboards/widget-data';
  import {
    BAR_GROUPS,
    BAR_GROUP_LABEL,
    LINE_WEEKS,
    LIST_LIMITS,
    LIST_ORDERS,
    LIST_ORDER_LABEL,
    WIDGET_SIZES,
    WIDGET_TYPES,
    WIDGET_TYPE_LABEL,
    sizeOf,
    type DashboardDataset,
    type Widget,
    type WidgetConfig,
  } from '@/lib/widget-model';
  import WidgetChoice from './widget-choice.svelte';
  import WidgetField from './widget-field.svelte';
  import WidgetProjectFilters from './widget-project-filters.svelte';

  const ALL = '__all';

  let {
    initial,
    dataset,
    scopeProjectId,
    onCancel,
    onSave,
  }: {
    initial: Widget;
    dataset: DashboardDataset;
    scopeProjectId: string | null;
    onCancel: () => void;
    onSave: (widget: Widget) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state.raw<Widget>(initial);
  const now = Date.now();
  const config = $derived(draft.config);
  const setConfig = (patch: Partial<WidgetConfig>) => {
    draft = { ...draft, config: { ...draft.config, ...patch } };
  };

  // Filter chips (ids) only make sense for one project.
  const single = $derived(widgetProjects(draft, dataset));
  const project = $derived(single.length === 1 ? single[0] : null);
  const matching = $derived(widgetIssues(draft, dataset, now).length);

  const projectItems = $derived([
    { value: ALL, label: 'All projects' },
    ...dataset.projects.map((p) => ({ value: p.project.id, label: p.project.name })),
  ]);

  function setProject(value: string) {
    const projectId = value === ALL ? null : value;
    if (projectId === config.projectId) return;
    // Id-based filters and the epic belong to the old project; keep only the query.
    setConfig({
      projectId,
      epicId: null,
      filters: normalizeIssueFilters({ q: config.filters.q }),
    });
  }
</script>

<form
  class="flex flex-col gap-4"
  onsubmit={(event) => {
    event.preventDefault();
    onSave({ ...draft, title: draft.title.trim() || WIDGET_TYPE_LABEL[draft.type] });
  }}
>
  <DialogHeader>
    <DialogTitle>Edit widget</DialogTitle>
    <DialogDescription>
      {matching === 1 ? '1 issue matches' : `${matching} issues match`} the current filters.
    </DialogDescription>
  </DialogHeader>

  <div class="grid gap-3 sm:grid-cols-2">
    <WidgetField label="Title" htmlFor="widget-title">
      <Input
        id="widget-title"
        bind:value={() => draft.title, (title) => (draft = { ...draft, title })}
        maxlength={80}
      />
    </WidgetField>
    <WidgetChoice
      label="Type"
      value={draft.type}
      options={WIDGET_TYPES}
      format={(type) => WIDGET_TYPE_LABEL[type]}
      onChange={(type) => (draft = { ...draft, type })}
    />
    {#if !scopeProjectId && dataset.projects.length > 1}
      <WidgetField label="Project">
        <Select type="single" value={config.projectId ?? ALL} items={projectItems} onValueChange={setProject}>
          <SelectTrigger size="sm" aria-label="Project" class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {#each dataset.projects as p (p.project.id)}
              <SelectItem value={p.project.id}>{p.project.name}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </WidgetField>
    {/if}
    <WidgetChoice
      label="Size"
      value={sizeOf(draft)}
      options={WIDGET_SIZES.map((s) => s.id)}
      format={(id) => WIDGET_SIZES.find((s) => s.id === id)!.label}
      onChange={(id) => {
        const size = WIDGET_SIZES.find((s) => s.id === id)!;
        draft = { ...draft, w: size.w, h: size.h };
      }}
    />
  </div>

  <WidgetField label="Filter" htmlFor="widget-query">
    <div class="flex items-center gap-1">
      <Input
        id="widget-query"
        bind:value={() => config.filters.q, (q) => setConfig({ filters: { ...config.filters, q } })}
        maxlength={200}
        placeholder="is:open label:bug assignee:me"
        class="font-mono text-xs"
      />
      <SearchSyntaxHelp
        note="Free text matches titles and IDs."
        onInsert={(token: string) =>
          setConfig({ filters: { ...config.filters, q: appendToken(config.filters.q, token) } })}
      />
    </div>
    {#if project}
      <ProjectDataProvider value={project}>
        <WidgetProjectFilters filters={config.filters} onChange={(filters) => setConfig({ filters })} />
      </ProjectDataProvider>
    {/if}
  </WidgetField>

  {#if draft.type === 'bar'}
    <WidgetChoice
      label="Group by"
      value={config.groupBy}
      options={BAR_GROUPS.filter((g) => g !== 'project' || !project)}
      format={(g) => BAR_GROUP_LABEL[g]}
      onChange={(groupBy) => setConfig({ groupBy })}
    />
  {/if}
  {#if draft.type === 'line'}
    <WidgetChoice
      label="Range"
      value={config.weeks}
      options={LINE_WEEKS}
      format={(w) => `Last ${w} weeks`}
      onChange={(weeks) => setConfig({ weeks })}
    />
  {/if}
  {#if draft.type === 'list'}
    <div class="grid gap-3 sm:grid-cols-2">
      <WidgetChoice
        label="Order"
        value={config.orderBy}
        options={LIST_ORDERS}
        format={(o) => LIST_ORDER_LABEL[o]}
        onChange={(orderBy) => setConfig({ orderBy })}
      />
      <WidgetChoice
        label="Show"
        value={config.limit}
        options={LIST_LIMITS}
        format={(n) => `${n} issues`}
        onChange={(limit) => setConfig({ limit })}
      />
    </div>
  {/if}
  {#if draft.type === 'epic' && project}
    <WidgetChoice
      label="Epic"
      value={config.epicId ?? ALL}
      options={[ALL, ...project.epics.map((e) => e.id)]}
      format={(id) => (id === ALL ? 'All epics' : (project.epics.find((e) => e.id === id)?.name ?? 'Unknown epic'))}
      onChange={(id) => setConfig({ epicId: id === ALL ? null : id })}
    />
  {/if}

  <DialogFooter>
    <Button type="button" variant="ghost" onclick={onCancel}>Cancel</Button>
    <Button type="submit">Save widget</Button>
  </DialogFooter>
</form>
