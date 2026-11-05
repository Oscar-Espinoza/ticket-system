<!--
  Right pane of the inbox: what happened (the group's notifications) above a
  read-only summary of the issue, with read / snooze / archive actions.
-->
<script lang="ts">
  import Archive from '@lucide/svelte/icons/archive';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import BellDot from '@lucide/svelte/icons/bell-dot';
  import Clock from '@lucide/svelte/icons/clock';
  import MailOpen from '@lucide/svelte/icons/mail-open';

  import { Button } from '@/lib/components/ui/button';
  import Markdown from '@/lib/components/editor/markdown.svelte';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import PickerPopover from '@/lib/components/issue-pickers/picker-popover.svelte';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';
  import { issuePath } from '@/lib/issue-links';
  import { notificationPath } from '@/lib/notifications/types';
  import { formatWhen, snoozePresets } from '@/lib/components/inbox/when-options';
  import type { InboxGroup } from './inbox-groups';
  import NotificationGlyph, { notificationSentence } from './notification-glyph.svelte';
  import WhenPicker from './when-picker.svelte';

  const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  let {
    group,
    issue,
    onToggleRead,
    onArchive,
    onSnooze,
    onBack,
  }: {
    group: InboxGroup;
    /** null when the issue is gone or the viewer left its project. */
    issue: IssueRow | null;
    onToggleRead: () => void;
    onArchive: () => void;
    onSnooze: (until: Date) => void;
    onBack: () => void;
  } = $props();

  const latest = $derived(group.latest);
  const key = $derived(issue?.key ?? latest.data.key ?? '');
  const title = $derived(issue?.title ?? latest.data.title ?? 'Notification');
  const href = $derived(issue ? issuePath(issue.projectId, issue.key) : null);
  // Pulse and other project-level notifications have no issue; they may carry a link.
  const standalone = $derived(!group.ticketId);
  const standaloneHref = $derived(standalone ? notificationPath(null, latest.data) : null);
</script>

<div class="flex min-h-full flex-col">
  <div class="sticky top-0 z-10 flex h-11 items-center gap-1 border-b border-border bg-background px-3">
    <Button variant="ghost" size="icon-sm" class="md:hidden" aria-label="Back to inbox" onclick={onBack}>
      <ArrowLeft />
    </Button>
    <span class="truncate font-mono text-xs text-muted-foreground">{key}</span>
    {#if latest.projectName}
      <span class="truncate text-xs text-muted-foreground">· {latest.projectName}</span>
    {/if}
    <div class="ml-auto flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onclick={onToggleRead}
        aria-label={group.unread ? 'Mark as read (U)' : 'Mark as unread (U)'}
        title={group.unread ? 'Mark as read (U)' : 'Mark as unread (U)'}
      >
        {#if group.unread}<MailOpen />{:else}<BellDot />{/if}
      </Button>
      <PickerPopover align="end" class="w-auto min-w-64">
        {#snippet children({ props })}
          <Button {...props} variant="ghost" size="icon-sm" aria-label="Snooze" title="Snooze">
            <Clock />
          </Button>
        {/snippet}
        {#snippet content(close)}
          <WhenPicker
            presets={snoozePresets()}
            onPick={(date) => {
              close();
              onSnooze(date);
            }}
          />
        {/snippet}
      </PickerPopover>
      <Button variant="ghost" size="icon-sm" onclick={onArchive} aria-label="Archive (E)" title="Archive (E)">
        <Archive />
      </Button>
      {#if href}
        <Button href={href} variant="outline" size="sm" class="ml-1">
          Open issue
          <ArrowUpRight />
        </Button>
      {/if}
      {#if standaloneHref && standaloneHref !== '/dashboard/inbox'}
        <Button href={standaloneHref} variant="outline" size="sm" class="ml-1">
          Open
          <ArrowUpRight />
        </Button>
      {/if}
    </div>
  </div>

  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
    {#if standalone && latest.data.title}
      <h2 class="text-lg font-medium leading-snug">{latest.data.title}</h2>
    {/if}
    <ol class="flex flex-col gap-3" aria-label="Notifications">
      {#each group.items as item (item.id)}
        <li class="flex gap-3">
          <NotificationGlyph notification={item} size={20} />
          <div class="min-w-0 flex-1">
            <p class="text-sm">
              <span class={item.readAt ? 'text-muted-foreground' : 'font-medium'}>
                {notificationSentence(item)}
              </span>
              <time
                datetime={new Date(item.at).toISOString()}
                title={absolute.format(new Date(item.at))}
                class="ml-2 text-xs text-muted-foreground"
              >
                {item.type === 'reminder' ? formatWhen(new Date(item.at)) : relativeTime(item.at)}
              </time>
            </p>
            {#if item.data.excerpt}
              <p class="mt-1 border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
                {item.data.excerpt}
              </p>
            {/if}
            {#if Array.isArray(item.data.lines) && item.data.lines.length > 0}
              <ul class="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                {#each item.data.lines as line, index (index)}
                  <li>{String(line)}</li>
                {/each}
              </ul>
            {/if}
          </div>
        </li>
      {/each}
    </ol>

    {#if !standalone}
      <article class="flex flex-col gap-4 rounded-lg border border-border p-5">
        <h2 class="text-lg font-medium leading-snug">
          {#if href}
            <a {href} class="hover:underline">{title}</a>
          {:else}
            {title}
          {/if}
        </h2>
        {#if issue}
          {@render issueFacts(issue)}
          {#if issue.description?.trim()}
            <Markdown
              projectId={issue.projectId}
              ticketKey={issue.key.slice(0, issue.key.lastIndexOf('-'))}
              class="text-sm"
              source={issue.description}
            />
          {:else}
            <p class="text-sm text-muted-foreground">No description.</p>
          {/if}
        {:else}
          <p class="text-sm text-muted-foreground">
            This issue is no longer available — it was deleted, or you are no longer a member of its
            project.
          </p>
        {/if}
      </article>
    {/if}
  </div>
</div>

{#snippet issueFacts(issue: IssueRow)}
  <dl
    class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground [&>div]:flex [&>div]:items-center [&>div]:gap-1.5"
  >
    <div>
      <dt class="sr-only">Status</dt>
      <StateIcon state={issue.state} size={14} />
      <dd class="text-foreground">{issue.state.name}</dd>
    </div>
    <div>
      <dt class="sr-only">Priority</dt>
      <PriorityIcon priority={issue.priority} size={14} />
      <dd>{PRIORITY_LABEL[issue.priority]}</dd>
    </div>
    <div>
      <dt class="sr-only">Assignee</dt>
      {#if issue.assignee}
        <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
        <dd>{issue.assignee.name}</dd>
      {:else}
        <dd>Unassigned</dd>
      {/if}
    </div>
    {#if issue.archivedAt || issue.deletedAt}
      <div>
        <dt class="sr-only">Visibility</dt>
        <dd class="rounded bg-muted px-1.5 py-0.5">{issue.deletedAt ? 'In trash' : 'Archived'}</dd>
      </div>
    {/if}
  </dl>
{/snippet}
