<!--
  Audit log table for a resolved scope (project or workspace). The data comes
  from loadAuditLogView() (audit-log-view.server.ts) in the page's server load;
  filters and the page cursor live in the URL.
-->
<script lang="ts">
  import BotIcon from '@lucide/svelte/icons/bot';
  import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';

  import type { AuditCategory } from '@/lib/audit';
  import Timestamp from '@/lib/components/comments/timestamp.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/lib/components/ui/table';
  import { Avatar, EmptyState, LabelChip, type LabelChipColor } from '@/lib/components/ui-icons';
  import { issuePath } from '@/lib/issue-links';
  import AuditFilterBar from './audit-filter-bar.svelte';
  import type { AuditLogViewData } from './audit-log-view.server';

  let { data }: { data: AuditLogViewData } = $props();

  const CATEGORY_COLOR: Record<AuditCategory, LabelChipColor> = {
    issues: 'todo',
    comments: 'backlog',
    planning: 'in_progress',
    members: 'in_review',
    settings: 'default',
    security: 'destructive',
    integrations: 'done',
    other: 'default',
  };
</script>

<div class="flex flex-col gap-4">
  <AuditFilterBar
    actors={data.actors}
    categories={data.categories}
    systemActor={data.systemActor}
    exportHref={data.exportHref}
  />

  {#if data.rows.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-10"
      title={data.filtered ? 'No matching events' : 'No events yet'}
      description={data.filtered
        ? 'Try a wider date range or clear the filters.'
        : 'Issue changes, member and role changes, and security events will show up here.'}
    >
      {#snippet icon()}<ScrollTextIcon />{/snippet}
    </EmptyState>
  {:else}
    <div class="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-28">Time</TableHead>
            <TableHead class="w-44">Actor</TableHead>
            <TableHead>Event</TableHead>
            {#if data.showTeam}<TableHead class="w-20">Team</TableHead>{/if}
            <TableHead class="w-24">Issue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.rows as row (row.id)}
            <TableRow class="text-sm">
              <TableCell class="text-muted-foreground">
                <Timestamp date={row.createdAt} />
              </TableCell>
              <TableCell>
                {#if row.actor}
                  <span class="flex min-w-0 items-center gap-2" title={row.actor.email}>
                    <Avatar name={row.actor.name} src={row.actor.image} size={20} />
                    <span class="truncate">{row.actor.name}</span>
                  </span>
                {:else}
                  <span class="flex items-center gap-2 text-muted-foreground">
                    <BotIcon aria-hidden="true" class="size-4" />
                    System
                  </span>
                {/if}
              </TableCell>
              <TableCell class="max-w-0 whitespace-normal">
                <span class="flex min-w-0 items-start gap-2">
                  <LabelChip color={CATEGORY_COLOR[row.category]} class="shrink-0">
                    {row.categoryLabel}
                  </LabelChip>
                  <span class="line-clamp-2 min-w-0 break-words" title={row.type}>{row.summary}</span>
                </span>
              </TableCell>
              {#if data.showTeam}
                <TableCell class="font-mono text-xs text-muted-foreground" title={row.project.name}>
                  {row.workspaceEvent ? '—' : row.project.key}
                </TableCell>
              {/if}
              <TableCell class="font-mono text-xs">
                {#if row.issue}
                  {#if row.issue.projectId}
                    <a
                      href={issuePath(row.issue.projectId, row.issue.key)}
                      class="hover:underline"
                      title={row.issue.title ?? undefined}
                    >
                      {row.issue.key}
                    </a>
                  {:else}
                    <span class="text-muted-foreground" title={row.issue.title ?? undefined}>{row.issue.key}</span>
                  {/if}
                {:else}
                  <span class="text-muted-foreground">—</span>
                {/if}
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {/if}

  {#if data.olderHref || data.newestHref}
    <div class="flex items-center justify-end gap-2">
      {#if data.newestHref}
        <Button variant="ghost" size="sm" href={data.newestHref}>Newest</Button>
      {/if}
      {#if data.olderHref}
        <Button variant="outline" size="sm" href={data.olderHref}>Older events</Button>
      {/if}
    </div>
  {/if}
</div>
