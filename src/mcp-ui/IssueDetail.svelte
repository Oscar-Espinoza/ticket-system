<script lang="ts">
  import { untrack } from 'svelte';

  import type { IssueDetail, ProjectMetadataView } from '@/lib/server/mcp/contracts';
  import { toDateString } from '@/lib/dates';
  import { callTool, host, projectMetadata, reportChange } from './lib/app.svelte';
  import { IssueWriter, newRequestId } from './lib/write.svelte';
  import { dueTone, relativeTime, safeColor, shortDate, STATE_TYPE_ORDER } from './lib/model';
  import Avatar from './Avatar.svelte';
  import Chip from './Chip.svelte';
  import ErrorState from './ErrorState.svelte';
  import Icon from './Icon.svelte';
  import Markdown from './Markdown.svelte';
  import OpenLink from './OpenLink.svelte';
  import PriorityIcon from './PriorityIcon.svelte';
  import StateIcon from './StateIcon.svelte';
  import { PRIORITY_LABEL } from './lib/model';

  interface Props {
    issue: IssueDetail;
    /** What the call that produced this issue changed (write results). */
    changes?: string[];
    /** Inside an expanded list row: no outer title block. */
    compact?: boolean;
    /** The issue after a write, so the list row behind it can follow. */
    onupdate?: (issue: IssueDetail) => void;
  }
  let { issue: initial, changes: initialChanges = [], compact = false, onupdate }: Props = $props();

  let issue = $state.raw<IssueDetail>(untrack(() => initial));
  const writer = new IssueWriter(
    {
      call: callTool,
      issueKey: () => issue.key,
      onIssue: (next) => {
        issue = next;
        onupdate?.(next);
      },
      onChange: reportChange,
    },
    untrack(() => (initialChanges.length ? { kind: 'ok', text: `Done: ${initialChanges.join('; ')}.` } : null)),
  );
  let statesOpen = $state(false);
  let metadata = $state.raw<ProjectMetadataView | null>(null);
  let metadataError = $state('');
  let comment = $state('');
  // One id per draft, kept until the draft is cleared: sending the same draft again (after a timeout, say) can't post it twice.
  let draftId: string | null = null;
  let descriptionOpen = $state(false);
  let commentBox = $state<HTMLTextAreaElement | null>(null);
  let stateToggle = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);

  const closed = $derived(issue.state.type === 'completed' || issue.state.type === 'canceled');
  const today = toDateString(new Date());
  const longDescription = $derived((issue.description?.length ?? 0) > 700);
  // Writes go through the host's tool forwarding: without it the controls are not offered.
  const writable = $derived(!issue.deletedAt && host.canCallTools);
  const locked = $derived(writer.busy !== null || writer.unconfirmed !== null);
  const hiddenComments = $derived(issue.commentCount - issue.comments.length);
  const locale = $derived(host.context.locale);

  const assigneeBefore = () => issue.assignee?.id ?? null;

  async function toggleStates() {
    statesOpen = !statesOpen;
    if (statesOpen && !metadata) {
      metadataError = '';
      metadata = await projectMetadata(issue.project.key);
      if (!metadata) metadataError = 'Could not load the workflow states.';
    }
  }

  function menuKeys(event: KeyboardEvent) {
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      statesOpen = false;
      stateToggle?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    }
  }

  async function pickState(id: string, name: string) {
    statesOpen = false;
    if (id === issue.state.id) return;
    await writer.write({
      tool: 'update_issue',
      args: { state: id },
      label: `Moving to ${name}…`,
      summary: `state changed to ${name}`,
      applied: (i) => i.state.id === id,
    });
  }

  function assign(to: 'me' | 'none') {
    const before = assigneeBefore();
    return writer.write({
      tool: 'update_issue',
      args: { assignee: to },
      label: to === 'me' ? 'Assigning…' : 'Unassigning…',
      summary: to === 'me' ? 'assigned to you' : 'unassigned',
      applied: to === 'me' ? (i) => i.assignee !== null && i.assignee.id !== before : (i) => i.assignee === null,
    });
  }

  async function submitComment() {
    const body = comment.trim();
    if (!body || locked) return;
    const requestId = (draftId ??= newRequestId());
    const saved = await writer.write({
      tool: 'add_comment',
      args: { body, request_id: requestId },
      label: 'Posting…',
      summary: 'comment added',
      applied: (i) => i.comments.some((c) => c.id === requestId),
      onSaved: () => {
        comment = '';
        draftId = null;
      },
    });
    if (!saved) commentBox?.focus();
  }

  const statesByType = $derived.by(() => {
    const states = metadata?.states ?? [];
    const order = (t: string) => STATE_TYPE_ORDER.indexOf(t as (typeof STATE_TYPE_ORDER)[number]);
    return [...states].sort((a, b) => order(a.type) - order(b.type));
  });
</script>

<article class="min-w-0 space-y-3" aria-label="Issue {issue.key}">
  <header class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="flex flex-wrap items-center gap-x-2 text-fg2">
        <span class="font-code font-medium text-fg">{issue.key}</span>
        <span class="truncate">{issue.project.name}</span>
        {#if issue.archivedAt}<Chip>Archived</Chip>{/if}
        {#if issue.deletedAt}<Chip tone="danger">In trash</Chip>{/if}
      </p>
      {#if !compact}
        <h2 class="mt-1 text-[1.25em] leading-snug font-semibold [overflow-wrap:anywhere]">{issue.title}</h2>
      {/if}
    </div>
    <OpenLink url={issue.url} label="Open in Ticket System" compact />
  </header>

  <dl class="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5">
    <dt class="text-fg2">State</dt>
    <dd class="min-w-0">
      {#if writable}
        <button
          type="button"
          class="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-viewsm border border-line px-2.5 hover:bg-bg2 disabled:opacity-60"
          aria-expanded={statesOpen}
          aria-controls="states-{issue.id}"
          bind:this={stateToggle}
          disabled={locked}
          onclick={toggleStates}
        >
          <StateIcon type={issue.state.type} color={issue.state.color} />
          <span class="truncate">{issue.state.name}</span>
          <Icon name={statesOpen ? 'chevron-down' : 'chevron-right'} size={12} />
        </button>
      {:else}
        <span class="inline-flex items-center gap-1.5"><StateIcon type={issue.state.type} color={issue.state.color} />{issue.state.name}</span>
      {/if}
    </dd>
    {#if statesOpen}
      <dd class="col-span-2 -mt-0.5 mb-1" id="states-{issue.id}">
        {#if metadataError}
          <p class="text-danger" role="alert">{metadataError}</p>
        {:else if !metadata}
          <p class="text-fg2" role="status">Loading states…</p>
        {:else}
          <ul class="flex flex-wrap gap-1.5" role="menu" aria-label="Move {issue.key} to" bind:this={menu} onkeydown={menuKeys}>
            {#each statesByType as state (state.id)}
              <li role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={state.id === issue.state.id}
                  class="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 hover:bg-bg2 {state.id === issue.state.id ? 'border-accent bg-infobg' : 'border-line'}"
                  onclick={() => pickState(state.id, state.name)}
                >
                  <StateIcon type={state.type} color={state.color} />{state.name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </dd>
    {/if}

    <dt class="text-fg2">Priority</dt>
    <dd class="inline-flex items-center gap-1.5"><PriorityIcon priority={issue.priority} label={false} />{PRIORITY_LABEL[issue.priority as keyof typeof PRIORITY_LABEL] ?? issue.priority}</dd>

    <dt class="text-fg2">Assignee</dt>
    <dd class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span class="inline-flex min-w-0 items-center gap-1.5"><Avatar user={issue.assignee} size={20} /><span class="truncate" title={issue.assignee?.name}>{issue.assignee?.name ?? 'Unassigned'}</span></span>
      {#if writable}
        <button type="button" class="min-h-8 rounded-viewsm border border-line px-2.5 text-fg2 hover:bg-bg2 hover:text-fg disabled:opacity-50" disabled={locked} onclick={() => assign('me')}>Assign to me</button>
        {#if issue.assignee}
          <button type="button" class="min-h-8 rounded-viewsm px-2.5 text-fg2 hover:bg-bg2 hover:text-fg disabled:opacity-50" disabled={locked} onclick={() => assign('none')}>Unassign</button>
        {/if}
      {/if}
    </dd>

    {#if issue.waitingOn}
      <dt class="text-fg2">Waiting on</dt>
      <dd class="inline-flex min-w-0 items-center gap-1.5"><Icon name="wait" size={14} /><Avatar user={issue.waitingOn} size={20} /><span class="truncate" title={issue.waitingOn.name}>{issue.waitingOn.name}</span></dd>
    {/if}

    {#if issue.labels.length}
      <dt class="self-start pt-0.5 text-fg2">Labels</dt>
      <dd class="flex min-w-0 flex-wrap gap-1">
        {#each issue.labels as label (label.id)}
          <Chip tint={safeColor(label.color)}><span class="truncate">{label.name}</span></Chip>
        {/each}
      </dd>
    {/if}

    {#if issue.cycle}
      <dt class="text-fg2">Cycle</dt>
      <dd class="min-w-0 truncate">Cycle {issue.cycle.number}{issue.cycle.name ? ` · ${issue.cycle.name}` : ''}</dd>
    {/if}
    {#if issue.epic}
      <dt class="text-fg2">Epic</dt>
      <dd class="min-w-0 truncate">{issue.epic.name}</dd>
    {/if}
    {#if issue.parent}
      <dt class="text-fg2">Parent</dt>
      <dd class="min-w-0 truncate"><span class="font-code">{issue.parent.key}</span> {issue.parent.title}</dd>
    {/if}
    {#if issue.dueDate}
      {@const tone = closed ? 'later' : dueTone(issue.dueDate, today)}
      <dt class="text-fg2">Due</dt>
      <dd class="inline-flex items-center gap-1.5 {tone === 'overdue' ? 'text-danger' : tone === 'soon' ? 'text-warn' : ''}">
        <Icon name="calendar" size={14} />{shortDate(issue.dueDate, locale, today)}{#if tone === 'overdue'}<span> · overdue</span>{:else if tone === 'soon'}<span> · due soon</span>{/if}
      </dd>
    {/if}
    {#if issue.followUp}
      {@const due = !closed && issue.followUp <= today}
      <dt class="text-fg2">Follow-up</dt>
      <dd class="inline-flex items-center gap-1.5 {due ? 'text-warn' : ''}">
        <Icon name="clock" size={14} />{shortDate(issue.followUp, locale, today)}{#if due}<span> · due</span>{/if}
      </dd>
    {/if}
    {#if issue.estimate != null}
      <dt class="text-fg2">Estimate</dt>
      <dd>{issue.estimate} {issue.estimate === 1 ? 'point' : 'points'}</dd>
    {/if}
  </dl>

  <div aria-live="polite" class="min-h-0">
    {#if writer.busy}
      <p class="text-fg2" role="status">{writer.busy}</p>
    {:else if writer.status?.kind === 'ok'}
      <p class="rounded-viewsm bg-infobg px-2.5 py-1.5 text-fg [overflow-wrap:anywhere]" role="status">{writer.status.text}</p>
    {/if}
  </div>
  {#if writer.status?.kind === 'error'}
    <ErrorState title={writer.unconfirmed ? 'Not confirmed' : 'Not saved'} message={writer.status.text} />
    {#if writer.unconfirmed}
      <button type="button" class="min-h-8 rounded-view border border-line2 px-3 font-medium hover:bg-bg2 disabled:opacity-60" disabled={writer.busy !== null} onclick={() => void writer.check()}>Check again</button>
    {/if}
  {/if}

  <section aria-label="Description">
    {#if issue.description?.trim()}
      <div class="relative {longDescription && !descriptionOpen ? 'max-h-48 overflow-hidden' : ''}">
        <Markdown source={issue.description} />
        {#if longDescription && !descriptionOpen}
          <div class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg to-transparent"></div>
        {/if}
      </div>
      {#if longDescription}
        <button type="button" class="mt-1 inline-flex min-h-8 items-center text-accent hover:underline" aria-expanded={descriptionOpen} onclick={() => (descriptionOpen = !descriptionOpen)}>
          {descriptionOpen ? 'Show less' : 'Show more'}
        </button>
      {/if}
    {:else}
      <p class="text-fg2 italic">No description.</p>
    {/if}
  </section>

  {#if issue.subIssues.length}
    <section aria-label="Sub-issues">
      <h3 class="mb-1 font-semibold">Sub-issues <span class="font-normal text-fg2">({issue.subIssues.length})</span></h3>
      <ul class="space-y-1">
        {#each issue.subIssues as sub (sub.id)}
          <li class="flex min-w-0 items-center gap-2"><StateIcon type={sub.state.type} color={sub.state.color} /><span class="font-code text-fg2">{sub.key}</span><span class="truncate">{sub.title}</span></li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if issue.relations.length}
    <section aria-label="Relations">
      <h3 class="mb-1 font-semibold">Relations</h3>
      <ul class="space-y-1">
        {#each issue.relations as rel (rel.kind + rel.issue.id)}
          <li class="flex min-w-0 items-center gap-2"><span class="shrink-0 text-fg2">{rel.kind.replaceAll('_', ' ')}</span><StateIcon type={rel.issue.state.type} color={rel.issue.state.color} /><span class="font-code text-fg2">{rel.issue.key}</span><span class="truncate">{rel.issue.title}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  <section aria-label="Comments" class="space-y-2.5">
    <h3 class="font-semibold">
      Comments <span class="font-normal text-fg2">({issue.commentCount})</span>
    </h3>
    {#if hiddenComments > 0}
      <p class="text-fg2">Showing the latest {issue.comments.length} of {issue.commentCount}.</p>
    {/if}
    {#each issue.comments as c (c.id)}
      <div class="flex gap-2">
        <Avatar user={c.author} size={24} />
        <div class="min-w-0 flex-1">
          <p class="text-fg2"><span class="font-medium text-fg">{c.author?.name ?? 'Deleted user'}</span> · <time datetime={c.createdAt} title={c.createdAt}>{relativeTime(c.createdAt, new Date(), locale)}</time></p>
          <Markdown source={c.body} />
        </div>
      </div>
    {:else}
      <p class="text-fg2 italic">No comments yet.</p>
    {/each}

    {#if writable}
      <form
        class="space-y-1.5"
        onsubmit={(e) => {
          e.preventDefault();
          void submitComment();
        }}
      >
        <label class="sr-only-text" for="comment-{issue.id}">Add a comment to {issue.key}</label>
        <textarea
          id="comment-{issue.id}"
          bind:this={commentBox}
          bind:value={comment}
          rows="3"
          maxlength="10000"
          placeholder="Write a comment (Markdown)…"
          class="block w-full resize-y rounded-view border border-line2 bg-bg p-2 placeholder:text-fg3"
          onkeydown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submitComment();
            }
          }}
        ></textarea>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[0.85em] text-fg3">Ctrl/⌘ + Enter to send</span>
          <button type="submit" class="inline-flex min-h-8 items-center gap-1.5 rounded-view bg-accent px-3 font-medium text-accentfg disabled:opacity-60" disabled={locked || comment.trim() === ''}>
            <Icon name="comment" size={13} />Comment
          </button>
        </div>
      </form>
    {/if}
  </section>
</article>
