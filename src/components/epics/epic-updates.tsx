'use client';

// Epic updates: a composer (health + markdown, ⌘Enter to post) and the feed.
// Posting also sets the epic's health (server-side, in the same batch).

import { useOptimistic, useState, useTransition } from 'react';
import { MessageSquareText, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteEpicUpdate, postEpicUpdate } from '@/app/actions/epics';
import { relativeTime } from '@/components/issues/issue-properties';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState } from '@/components/ui-icons';
import type { ProjectMember } from '@/lib/project-data-types';
import { HealthChip, HealthDot } from './epic-glyphs';
import {
  HEALTHS,
  HEALTH_LABEL,
  UPDATE_BODY_MAX,
  isHealth,
  type EpicUpdateRow,
  type Health,
} from './epic-model';
import { RichText, RichTextEditor } from './rich-text';

const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function EpicUpdates({
  projectId,
  epicId,
  updates,
  currentHealth,
  viewer,
  canWrite,
  isAdmin,
}: {
  projectId: string;
  epicId: string;
  updates: EpicUpdateRow[];
  currentHealth: Health | null;
  viewer: ProjectMember;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const [feed, removeOptimistic] = useOptimistic(updates, (list, id: string) =>
    list.filter((u) => u.id !== id),
  );
  const [, startTransition] = useTransition();

  const remove = (update: EpicUpdateRow) =>
    startTransition(async () => {
      removeOptimistic(update.id);
      const result = await deleteEpicUpdate({ projectId, id: update.id });
      if (!result.ok) toast.error(result.error);
    });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {canWrite && (
        <UpdateComposer
          projectId={projectId}
          epicId={epicId}
          initialHealth={currentHealth ?? 'on_track'}
        />
      )}
      {feed.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText />}
          title="No updates yet"
          description="Post a short update to tell everyone how this epic is going. The latest update sets its health."
        />
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Updates">
          {feed.map((update) => (
            <li key={update.id}>
              <UpdateCard
                update={update}
                canDelete={canWrite && (isAdmin || update.author?.id === viewer.id)}
                onDelete={() => remove(update)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function UpdateComposer({
  projectId,
  epicId,
  initialHealth,
}: {
  projectId: string;
  epicId: string;
  initialHealth: Health;
}) {
  const [health, setHealth] = useState<Health>(initialHealth);
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!body.trim() || pending) return;
    startTransition(async () => {
      const result = await postEpicUpdate({ projectId, epicId, health, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody('');
      toast.success('Update posted');
    });
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={0}
        value={health}
        onValueChange={(value) => isHealth(value) && setHealth(value)}
        aria-label="Health"
      >
        {HEALTHS.map((h) => (
          <ToggleGroupItem key={h} value={h} className="gap-1.5 px-2.5 text-xs">
            <HealthDot health={h} />
            {HEALTH_LABEL[h]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <RichTextEditor
        aria-label="Update"
        value={body}
        onChange={setBody}
        onSubmit={submit}
        placeholder="What changed since the last update? Markdown supported."
        maxLength={UPDATE_BODY_MAX}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">⌘Enter to post</span>
        <Button type="submit" size="sm" className="ml-auto" disabled={!body.trim() || pending}>
          Post update
        </Button>
      </div>
    </form>
  );
}

export function UpdateCard({
  update,
  canDelete = false,
  onDelete,
  compact = false,
}: {
  update: EpicUpdateRow;
  canDelete?: boolean;
  onDelete?: () => void;
  /** Clamp the body (overview excerpt). */
  compact?: boolean;
}) {
  const createdAt = new Date(update.createdAt);
  return (
    <article className="flex flex-col gap-2 rounded-md border border-border p-3">
      <header className="flex items-center gap-2 text-sm">
        <HealthChip health={update.health} className="font-medium" />
        <span className="text-muted-foreground">·</span>
        <Avatar name={update.author?.name ?? 'Someone'} src={update.author?.image} size={20} />
        <span className="truncate">{update.author?.name ?? 'Someone'}</span>
        <time
          dateTime={createdAt.toISOString()}
          title={absolute.format(createdAt)}
          className="text-xs text-muted-foreground"
        >
          {relativeTime(createdAt)}
        </time>
        {canDelete && onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Update actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Delete update
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <RichText source={update.body} className={compact ? 'line-clamp-4' : undefined} />
    </article>
  );
}
