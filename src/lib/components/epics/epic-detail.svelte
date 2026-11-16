<!--
  Epic page: header (editable name), tabs Overview · Updates · Issues (`?tab=`).
  Overview = description, latest update, milestones + a property sidebar.
  Property edits are optimistic  and settle on the refreshed props.
  Issues from sibling projects (cross-project epics) get a project switcher on
  the Issues tab; only this project's issues are editable in place.
-->
<script module lang="ts">
  import type { DocumentSummary } from '@/lib/document-model';
  import type { IssueRow } from '@/lib/issue-model';
  import type {
    EpicLabelRow,
    EpicRelationRow,
    EpicRow,
    EpicUpdateRow,
    InitiativeOption,
    MilestoneRow,
    ProjectRef,
  } from '@/lib/epic-model';

  export interface EpicDetailProps {
    epic: EpicRow;
    milestones: MilestoneRow[];
    updates: EpicUpdateRow[];
    /** Active issues from every project the viewer is in (cross-project epics). */
    issues: IssueRow[];
    /** Projects of `issues` other than this one. */
    issueProjects: ProjectRef[];
    /** The project's epic labels. */
    labels: EpicLabelRow[];
    relations: EpicRelationRow[];
    /** Project docs linked to this epic. */
    documents?: DocumentSummary[];
    /** null: the project isn't in a workspace the viewer belongs to. */
    initiatives: InitiativeOption[] | null;
    workspaceSlug: string | null;
    defaultView?: string;
  }
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import CalendarRangeIcon from '@lucide/svelte/icons/calendar-range';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import TagIcon from '@lucide/svelte/icons/tag';
  import TargetIcon from '@lucide/svelte/icons/target';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import { toast } from 'svelte-sonner';

  import { copyToClipboard } from '@/lib/components/clipboard';
  import { setEpicLabels } from '@/lib/actions/epic-labels';
  import { archiveEpic, unarchiveEpic, updateEpic, type EpicInput } from '@/lib/actions/epics';
  import { setEpicInitiative } from '@/lib/actions/initiatives';
  import EpicDocuments from '@/lib/components/documents/epic-documents.svelte';
  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import IssuesView from '@/lib/components/issues/issues-view.svelte';
  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { Avatar } from '@/lib/components/ui-icons';
  import { formatDueDate } from '@/lib/dates';
  import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
  import { DEFAULT_EPIC_COLOR, EPIC_STATUS_LABEL } from '@/lib/epic-model';
  import ColorSwatches from './color-swatches.svelte';
  import DatePicker from './date-picker.svelte';
  import EpicDescription from './epic-description.svelte';
  import EpicForeignIssues from './epic-foreign-issues.svelte';
  import EpicIcon from './epic-icon.svelte';
  import EpicLabelChips from './epic-label-chips.svelte';
  import EpicLabelPicker from './epic-label-picker.svelte';
  import EpicName from './epic-name.svelte';
  import PropertyButton from './epic-property-button.svelte';
  import EpicDependencies from './epic-relations.svelte';
  import EpicStatusIcon from './epic-status-icon.svelte';
  import EpicStatusPicker from './epic-status-picker.svelte';
  import EpicUpdates from './epic-updates.svelte';
  import HealthChip from './health-chip.svelte';
  import HealthPicker from './health-picker.svelte';
  import InitiativePicker from './initiative-picker.svelte';
  import MemberPicker from './member-picker.svelte';
  import MilestonesSection from './milestones-section.svelte';
  import { mergePatch, Optimistic } from './optimistic.svelte';
  import ProgressBlock from './progress-block.svelte';
  import UpdateCard from './update-card.svelte';
  
  const TABS = ['overview', 'updates', 'issues'] as const;
  type Tab = (typeof TABS)[number];

  const setParam = (name: string, value: string | null) => setSearchParams({ [name]: value });
  const setTabParam = (tab: Tab) => setParam('tab', tab === 'overview' ? null : tab);

  let {
    epic: serverEpic,
    milestones,
    updates,
    issues,
    issueProjects,
    labels,
    relations,
    documents = [],
    initiatives,
    workspaceSlug,
    defaultView,
  }: EpicDetailProps = $props();

  const data = useProjectData();
  const project = $derived(data.project);
  const members = $derived(data.members);
  const viewer = $derived(data.viewer);
  const projectEpics = $derived(data.epics);
  const canWritePermission = useProjectPermission('write');
  const isAdminPermission = useProjectPermission('admin');
  const canWrite = $derived(canWritePermission.current);
  const isAdmin = $derived(isAdminPermission.current);
  const searchParams = useSearchParams();

  const optimistic = new Optimistic(
    () => serverEpic,
    (current: EpicRow, patch: Partial<EpicRow>) => mergePatch(current, patch),
  );
  const epic = $derived(optimistic.current);

  const ownIssues = $derived(issues.filter((i) => i.projectId === project.id));
  const foreignProject = $derived(
    issueProjects.find((p) => p.id === searchParams.get('project')) ?? null,
  );

  const tab: Tab = $derived.by(() => {
    const param = searchParams.get('tab');
    return TABS.includes(param as Tab)
      ? (param as Tab)
      : searchParams.get('issue')
        ? 'issues'
        : 'overview';
  });

  const save = (patch: EpicInput, next: Partial<EpicRow>) =>
    void optimistic.transition(async () => {
      optimistic.apply(next);
      const result = await updateEpic({ projectId: project.id, id: epic.id, patch });
      if (!result.ok) toast.error(result.error);
    });

  const setInitiative = (initiativeId: string | null) =>
    void optimistic.transition(async () => {
      optimistic.apply({ initiativeId });
      const result = await setEpicInitiative({
        projectId: project.id,
        epicId: epic.id,
        initiativeId,
      });
      if (!result.ok) toast.error(result.error);
    });

  const setLabels = (labelIds: string[]) =>
    void optimistic.transition(async () => {
      optimistic.apply({ labelIds });
      const result = await setEpicLabels({ projectId: project.id, epicId: epic.id, labelIds });
      if (!result.ok) toast.error(result.error);
    });

  const toggleArchive = () => {
    // The render-time value.
    const archived = epic.archivedAt;
    const id = epic.id;
    void optimistic.transition(async () => {
      optimistic.apply({ archivedAt: archived ? null : new Date() });
      const action = archived ? unarchiveEpic : archiveEpic;
      const result = await action({ projectId: project.id, id });
      if (!result.ok) toast.error(result.error);
      else toast.success(archived ? m.projects_epic_restored() : m.projects_epic_archived());
    });
  };

  const copyLink = () => copyToClipboard(window.location.href.split('?')[0], m.projects_epic_link());

  const lead = $derived(epic.lead);
  const initiative = $derived(initiatives?.find((i) => i.id === epic.initiativeId) ?? null);
  const switcherProjects = $derived([
    { id: project.id, name: project.name, ticketKey: project.ticketKey },
    ...issueProjects,
  ]);
</script>

{#snippet statusTrigger(props: Record<string, unknown>)}
  <PropertyButton {...props} disabled={!canWrite}>
    <EpicStatusIcon status={epic.status} />
    {EPIC_STATUS_LABEL[epic.status]}
  </PropertyButton>
{/snippet}

{#snippet healthTrigger(props: Record<string, unknown>)}
  <PropertyButton {...props} disabled={!canWrite}>
    {#if epic.health}
      <HealthChip health={epic.health} class="text-sm" />
    {:else}
      <span class="text-muted-foreground">{m.projects_no_updates()}</span>
    {/if}
  </PropertyButton>
{/snippet}

{#snippet leadTrigger(props: Record<string, unknown>)}
  <PropertyButton {...props} disabled={!canWrite}>
    {#if lead}
      <Avatar name={lead.name} src={lead.image} size={20} />
      <span class="truncate">{lead.name}</span>
    {:else}
      <UserRoundIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">{m.projects_no_lead()}</span>
    {/if}
  </PropertyButton>
{/snippet}

{#snippet labelsTrigger(props: Record<string, unknown>)}
  <PropertyButton {...props} disabled={!canWrite}>
    {#if epic.labelIds?.length}
      <EpicLabelChips
        {labels}
        labelIds={epic.labelIds}
        max={2}
        class="flex-nowrap overflow-hidden"
      />
    {:else}
      <TagIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">{m.projects_add_labels()}</span>
    {/if}
  </PropertyButton>
{/snippet}

{#snippet startTrigger(props: Record<string, unknown>)}
  <PropertyButton {...props} disabled={!canWrite}>
    <CalendarRangeIcon class="text-muted-foreground" />
    {#if epic.startDate}
      {formatDueDate(epic.startDate)}
    {:else}
      <span class="text-muted-foreground">{m.projects_set_start()}</span>
    {/if}
  </PropertyButton>
{/snippet}

{#snippet targetTrigger(props: Record<string, unknown>)}
  <PropertyButton {...props} disabled={!canWrite}>
    <CalendarDaysIcon class="text-muted-foreground" />
    {#if epic.targetDate}
      {formatDueDate(epic.targetDate)}
    {:else}
      <span class="text-muted-foreground">{m.projects_set_target()}</span>
    {/if}
  </PropertyButton>
{/snippet}

{#snippet initiativeTrigger(props: Record<string, unknown>, options: InitiativeOption[])}
  <PropertyButton {...props} disabled={!canWrite}>
    <TargetIcon class="text-muted-foreground" />
    {#if initiative}
      <span class="truncate">{initiative.name}</span>
    {:else}
      <span class="text-muted-foreground">
        {options.length ? m.projects_add_to_initiative() : m.projects_no_initiatives()}
      </span>
    {/if}
  </PropertyButton>
{/snippet}

{#snippet sidebar()}
  <aside aria-label={m.projects_epic_properties()} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <PropertyRow label={m.common_status()}>
        {#if canWrite}
          <EpicStatusPicker value={epic.status} onChange={(status) => save({ status }, { status })}>
            {#snippet children({ props })}{@render statusTrigger(props)}{/snippet}
          </EpicStatusPicker>
        {:else}
          {@render statusTrigger({})}
        {/if}
      </PropertyRow>
      <PropertyRow label={m.projects_health()}>
        {#if canWrite}
          <HealthPicker value={epic.health} onChange={(health) => save({ health }, { health })}>
            {#snippet children({ props })}{@render healthTrigger(props)}{/snippet}
          </HealthPicker>
        {:else}
          {@render healthTrigger({})}
        {/if}
      </PropertyRow>
      <PropertyRow label={m.projects_epic_lead()}>
        {#if canWrite}
          <MemberPicker
            value={lead?.id ?? null}
            {members}
            viewerId={viewer.id}
            onChange={(leadId) => {
              const member = members.find((m) => m.id === leadId);
              save(
                { leadId },
                { lead: member ? { id: member.id, name: member.name, image: member.image } : null },
              );
            }}
          >
            {#snippet children({ props })}{@render leadTrigger(props)}{/snippet}
          </MemberPicker>
        {:else}
          {@render leadTrigger({})}
        {/if}
      </PropertyRow>
      <PropertyRow label={m.common_labels()}>
        {#if canWrite}
          <EpicLabelPicker
            projectId={project.id}
            {labels}
            value={epic.labelIds ?? []}
            onChange={setLabels}
            canCreate={canWrite}
          >
            {#snippet children({ props })}{@render labelsTrigger(props)}{/snippet}
          </EpicLabelPicker>
        {:else}
          {@render labelsTrigger({})}
        {/if}
      </PropertyRow>
      <PropertyRow label={m.projects_epic_start_date()}>
        {#if canWrite}
          <DatePicker
            value={epic.startDate}
            clearLabel={m.projects_epic_clear_start()}
            onChange={(startDate) => save({ startDate }, { startDate })}
          >
            {#snippet children({ props })}{@render startTrigger(props)}{/snippet}
          </DatePicker>
        {:else}
          {@render startTrigger({})}
        {/if}
      </PropertyRow>
      <PropertyRow label={m.projects_epic_target_date()}>
        {#if canWrite}
          <DatePicker
            value={epic.targetDate}
            clearLabel={m.projects_epic_clear_target()}
            onChange={(targetDate) => save({ targetDate }, { targetDate })}
          >
            {#snippet children({ props })}{@render targetTrigger(props)}{/snippet}
          </DatePicker>
        {:else}
          {@render targetTrigger({})}
        {/if}
      </PropertyRow>
      {#if initiatives}
        <PropertyRow label={m.projects_initiative()}>
          {#if canWrite}
            <InitiativePicker value={epic.initiativeId} {initiatives} onChange={setInitiative}>
              {#snippet children({ props })}{@render initiativeTrigger(props, initiatives)}{/snippet}
            </InitiativePicker>
          {:else}
            {@render initiativeTrigger({}, initiatives)}
          {/if}{#if initiative && workspaceSlug}<a
              href={`/dashboard/workspaces/${workspaceSlug}/initiatives/${initiative.id}`}
              class="ml-1 text-xs text-muted-foreground hover:text-foreground">{m.projects_open()}</a
            >{/if}
        </PropertyRow>
      {/if}
      <PropertyRow label={m.projects_color()}>
        {#if canWrite}
          <Popover>
            <PopoverTrigger>
              {#snippet child({ props })}
                <PropertyButton {...props}>
                  <EpicIcon color={epic.color} />
                  <span class="text-muted-foreground">{m.projects_change()}</span>
                </PropertyButton>
              {/snippet}
            </PopoverTrigger>
            <PopoverContent align="start" class="w-auto p-2">
              <ColorSwatches
                value={epic.color ?? DEFAULT_EPIC_COLOR}
                onChange={(color) => save({ color }, { color })}
                class="max-w-40"
              />
            </PopoverContent>
          </Popover>
        {:else}
          <EpicIcon color={epic.color} />
        {/if}
      </PropertyRow>
    </div>
    <div class="flex flex-col gap-2 border-t border-border pt-4">
      <span class="text-xs text-muted-foreground">{m.projects_progress()}</span>
      <ProgressBlock progress={epic.progress} color={epic.color} />
    </div>
  </aside>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
    <a href={`/dashboard/projects/${project.id}/epics`} class="hover:text-foreground">{m.projects_epics()}</a>
    <ChevronRightIcon class="size-3" />
    <span class="truncate text-foreground">{epic.name}</span>
  </div>

  <div class="mb-3 flex items-start gap-2">
    <EpicIcon color={epic.color} class="mt-2 size-5" />
    <EpicName name={epic.name} {canWrite} onSave={(name) => save({ name }, { name })} />
    <div class="ml-auto flex shrink-0 items-center gap-1 pt-1">
      <FavoriteButton targetType="epic" targetId={epic.id} />
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label={m.projects_epic_actions()}>
              <EllipsisIcon />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem onSelect={copyLink}>
            <Link2Icon />
            {m.projects_copy_link()}
          </DropdownMenuItem>
          {#if canWrite}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleArchive}>
              {#if epic.archivedAt}<ArchiveRestoreIcon />{:else}<ArchiveIcon />{/if}
              {epic.archivedAt ? m.projects_unarchive() : m.projects_archive()}
            </DropdownMenuItem>
          {/if}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>

  {#if epic.archivedAt}
    <div class="mb-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      <ArchiveIcon class="size-4" />
      <span>{m.projects_epic_archived_notice()}</span>
      {#if canWrite}
        <Button size="xs" variant="outline" class="ml-auto" onclick={toggleArchive}>{m.projects_unarchive()}</Button>
      {/if}
    </div>
  {/if}

  <Tabs
    bind:value={() => tab, (value: string) => TABS.includes(value as Tab) && setTabParam(value as Tab)}
    class="flex min-h-0 flex-1 flex-col"
  >
    <TabsList variant="line" class="mb-3">
      <TabsTrigger value="overview">{m.projects_overview()}</TabsTrigger>
      <TabsTrigger value="updates">
        {m.projects_updates()}
        {#if updates.length > 0}
          <span class="text-xs text-muted-foreground tabular-nums">{updates.length}</span>
        {/if}
      </TabsTrigger>
      <TabsTrigger value="issues">
        {m.projects_issues()}
        <span class="text-xs text-muted-foreground tabular-nums">{issues.length}</span>
      </TabsTrigger>
    </TabsList>

    <TabsContent value="overview" class="min-h-0">
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div class="flex min-w-0 flex-col gap-8">
          <EpicDescription
            description={epic.description}
            {canWrite}
            onSave={(description) => save({ description }, { description })}
          />
          {#if updates[0]}
            <section aria-labelledby="latest-update" class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <h2 id="latest-update" class="text-sm font-medium">{m.projects_latest_update()}</h2>
                <button
                  type="button"
                  class="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onclick={() => setTabParam('updates')}
                >
                  {m.projects_all_updates()}
                </button>
              </div>
              <UpdateCard update={updates[0]} compact />
            </section>
          {/if}
          <MilestonesSection
            projectId={project.id}
            epicId={epic.id}
            {milestones}
            color={epic.color}
            {canWrite}
          />
          <EpicDependencies
            projectId={project.id}
            {epic}
            {relations}
            candidates={projectEpics}
            {canWrite}
          />
          <EpicDocuments projectId={project.id} epicId={epic.id} {documents} />
        </div>
        {@render sidebar()}
      </div>
    </TabsContent>

    <TabsContent value="updates">
      <EpicUpdates
        projectId={project.id}
        epicId={epic.id}
        {updates}
        currentHealth={epic.health}
        {viewer}
        {canWrite}
        {isAdmin}
      />
    </TabsContent>

    <!-- Mounted only while active: IssuesView registers list hotkeys and palette commands. -->
    {#if tab === 'issues'}
      <TabsContent value="issues" class="flex min-h-0 flex-1 flex-col">
        {#if issueProjects.length > 0}
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            bind:value={
              () => foreignProject?.id ?? project.id,
              (value: string) => value && setParam('project', value === project.id ? null : value)
            }
            aria-label={m.projects_issues_by_project()}
            class="mb-3 flex-wrap"
          >
            {#each switcherProjects as p (p.id)}
              <ToggleGroupItem value={p.id} class="gap-1.5 px-2.5 text-xs">
                <span class="font-mono text-muted-foreground">{p.ticketKey}</span>
                <span class="max-w-40 truncate">{p.name}</span>
                <span class="text-muted-foreground tabular-nums">
                  {issues.filter((i) => i.projectId === p.id).length}
                </span>
              </ToggleGroupItem>
            {/each}
          </ToggleGroup>
        {/if}
        {#if foreignProject}
          <EpicForeignIssues
            project={foreignProject}
            issues={issues.filter((i) => i.projectId === foreignProject.id)}
          />
        {:else}
          <IssuesView issues={ownIssues} {defaultView} createDefaults={{ epicId: epic.id }} />
        {/if}
      </TabsContent>
    {/if}
  </Tabs>
</div>
