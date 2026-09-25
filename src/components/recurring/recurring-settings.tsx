'use client';

// Settings → Recurring issues: the project's schedules, and the editor dialog
// (title, description, cadence, default properties, due offset) with a preview
// of the next runs.

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CirclePause,
  CirclePlay,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createRecurringIssue,
  deleteRecurringIssue,
  runRecurringIssueNow,
  setRecurringIssueEnabled,
  updateRecurringIssue,
} from '@/app/actions/recurring';
import { toDateInput, WEEKDAYS } from '@/components/cycles/cycle-utils';
import { PropertyChips } from '@/components/productivity/property-chips';
import { useProjectData } from '@/components/project/project-data';
import { Field } from '@/components/settings/field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { formatEstimate } from '@/lib/estimates';
import { issuePath } from '@/lib/issue-links';
import { isPriority, type IssuePatch } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';
import { cn } from '@/lib/utils';
import {
  DUE_IN_DAYS_MAX,
  FREQUENCIES,
  FREQUENCY_LABEL,
  INTERVAL_MAX,
  describeSchedule,
  formatRunDay,
  normalizeSchedule,
  upcomingRuns,
  type Frequency,
  type RecurringDefaults,
  type RecurringIssue,
  type RecurringSchedule,
} from './schedule';

const PREVIEW_RUNS = 5;
/** Monday first, as in the rest of the week pickers. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const UNIT: Record<Frequency, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
};

/** Stored defaults → chips value, dropping ids the project no longer has. */
function defaultsToPatch(
  data: RecurringDefaults,
  project: Pick<ProjectData, 'states' | 'labels' | 'members' | 'project'>,
): IssuePatch {
  const patch: IssuePatch = {};
  if (data.stateId && project.states.some((s) => s.id === data.stateId)) patch.stateId = data.stateId;
  if (isPriority(data.priority)) patch.priority = data.priority;
  if (data.assigneeId && project.members.some((m) => m.id === data.assigneeId)) {
    patch.assigneeId = data.assigneeId;
  }
  const labelIds = (data.labelIds ?? []).filter((id) => project.labels.some((l) => l.id === id));
  if (labelIds.length) patch.labelIds = labelIds;
  if (data.estimate != null && project.project.estimateScale !== 'none') patch.estimate = data.estimate;
  return patch;
}

export function RecurringSettings({
  projectId,
  items,
  canEdit,
  cronConfigured,
}: {
  projectId: string;
  items: RecurringIssue[];
  /** Members and up; guests see the list read-only. */
  canEdit: boolean;
  /** CRON_SECRET is set, so the daily job runs. */
  cronConfigured: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringIssue | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RecurringIssue | null>(null);
  const [, startAction] = useTransition();

  const act = (run: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startAction(async () => {
      const result = await run();
      if (!result.ok) toast.error(result.error ?? 'Something went wrong.');
      else if (success) toast.success(success);
    });

  const runNow = (item: RecurringIssue) =>
    startAction(async () => {
      const result = await runRecurringIssueNow({ projectId, id: item.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created ${result.key}`, {
        action: { label: 'Open', onClick: () => router.push(issuePath(projectId, result.key)) },
      });
    });

  const newButton = (
    <Button size="sm" onClick={() => setEditing('new')}>
      <Plus />
      New recurring issue
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {!cronConfigured && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Scheduled runs need the daily cron: set <code className="font-mono">CRON_SECRET</code> in
          the deployment (Vercel Cron calls <code className="font-mono">/api/cron/daily</code>).
          Until then, due issues are created whenever someone opens this page.
        </p>
      )}
      {canEdit && items.length > 0 && <div>{newButton}</div>}

      {items.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="No recurring issues"
          description="Create issues on a schedule — weekly reviews, monthly reports, daily checks."
          action={canEdit ? newButton : undefined}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <RecurringRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onEdit={() => setEditing(item)}
              onRun={() => runNow(item)}
              onToggle={() =>
                act(
                  () => setRecurringIssueEnabled({ projectId, id: item.id, enabled: !item.enabled }),
                  item.enabled ? 'Paused' : 'Resumed',
                )
              }
              onDelete={() => setDeleting(item)}
            />
          ))}
        </ul>
      )}

      <RecurringEditor
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        projectId={projectId}
        item={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              No more issues are created from it. Issues it already created stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const item = deleting;
                setDeleting(null);
                if (item) {
                  act(() => deleteRecurringIssue({ projectId, id: item.id }), 'Recurring issue deleted');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecurringRow({
  item,
  canEdit,
  onEdit,
  onRun,
  onToggle,
  onDelete,
}: {
  item: RecurringIssue;
  canEdit: boolean;
  onEdit: () => void;
  onRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const data = useProjectData();
  const props = defaultsToPatch(item.data, data);
  const state = data.states.find((s) => s.id === props.stateId);
  const assignee = data.members.find((m) => m.id === props.assigneeId);
  const labels = data.labels.filter((l) => props.labelIds?.includes(l.id));

  return (
    <li className={cn('flex min-h-12 items-center gap-3 px-3 py-2 text-sm', !item.enabled && 'opacity-70')}>
      <Repeat className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="truncate text-left font-medium outline-none hover:underline focus-visible:underline"
          >
            {item.title}
          </button>
        ) : (
          <span className="truncate font-medium">{item.title}</span>
        )}
        <span className="truncate text-xs text-muted-foreground">
          {item.broken ? 'Schedule unreadable — edit it to fix' : describeSchedule(item.schedule)}
          {item.data.dueInDays != null &&
            ` · due in ${item.data.dueInDays} ${item.data.dueInDays === 1 ? 'day' : 'days'}`}
        </span>
      </div>

      <div className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
        {state && <StateIcon state={state} size={14} />}
        {props.priority && props.priority !== 'none' && (
          <PriorityIcon priority={props.priority} size={14} />
        )}
        {labels.length > 0 && (
          <span className="flex items-center gap-0.5" title={labels.map((l) => l.name).join(', ')}>
            {labels.slice(0, 4).map((l) => (
              <span
                key={l.id}
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
            ))}
          </span>
        )}
        {props.estimate != null && (
          <span>{formatEstimate(data.project.estimateScale, props.estimate)}</span>
        )}
        {assignee && <Avatar name={assignee.name} src={assignee.image} size={20} />}
      </div>

      <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {item.enabled ? `Next ${formatRunDay(item.nextRunAt)}` : 'Paused'}
      </span>

      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRun}>
              <Play />
              Create issue now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggle}>
              {item.enabled ? <CirclePause /> : <CirclePlay />}
              {item.enabled ? 'Pause' : 'Resume'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function RecurringEditor({
  projectId,
  item,
  open,
  onClose,
}: {
  projectId: string;
  /** null = new schedule. */
  item: RecurringIssue | null;
  open: boolean;
  onClose: () => void;
}) {
  const data = useProjectData();
  const uid = useId();
  const [today] = useState(() => toDateInput(Date.now()));
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [freq, setFreq] = useState<Frequency>(item?.schedule.freq ?? 'weekly');
  const [every, setEvery] = useState(String(item?.schedule.interval ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(
    item?.schedule.weekdays ?? [new Date().getUTCDay()],
  );
  const [dayOfMonth, setDayOfMonth] = useState(item?.schedule.dayOfMonth ?? new Date().getUTCDate());
  const [start, setStart] = useState(item?.schedule.start ?? today);
  const [props, setProps] = useState<IssuePatch>(() => (item ? defaultsToPatch(item.data, data) : {}));
  const [dueInDays, setDueInDays] = useState(
    item?.data.dueInDays != null ? String(item.data.dueInDays) : '',
  );
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const schedule: RecurringSchedule = {
    freq,
    interval: Number(every),
    start,
    ...(freq === 'weekly' ? { weekdays } : {}),
    ...(freq === 'monthly' ? { dayOfMonth } : {}),
  };
  const parsed = normalizeSchedule(schedule);
  const preview = parsed.ok
    ? upcomingRuns(parsed.schedule, Math.max(Date.parse(today), Date.parse(start)), PREVIEW_RUNS)
    : [];
  const fieldError = (field: string) => (error?.field === field ? error.message : undefined);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const due = dueInDays.trim() === '' ? null : Number(dueInDays);
    const input = {
      projectId,
      title,
      description,
      schedule,
      data: {
        stateId: props.stateId,
        priority: props.priority,
        assigneeId: props.assigneeId ?? null,
        labelIds: props.labelIds ?? [],
        estimate: props.estimate ?? null,
        dueInDays: due,
      },
    };
    startSaving(async () => {
      const result = item
        ? await updateRecurringIssue({ ...input, id: item.id })
        : await createRecurringIssue(input);
      if (!result.ok) {
        setError({ field: result.field, message: result.error });
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(item ? 'Recurring issue updated' : 'Recurring issue created');
      onClose();
    });
  };

  const [one, many] = UNIT[freq];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit recurring issue' : 'New recurring issue'}</DialogTitle>
          <DialogDescription>An issue with these values is created on every run.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id={`${uid}-title`} label="Title" error={fieldError('title')}>
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly dependency updates"
              maxLength={200}
              autoFocus
              aria-invalid={fieldError('title') ? true : undefined}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>Description</Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Checklist, links, context…"
              rows={4}
            />
            {fieldError('description') && (
              <p role="alert" className="text-xs text-destructive">
                {fieldError('description')}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-sm font-medium">Repeat</legend>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Select
                value={freq}
                onValueChange={(v) => {
                  setFreq(v as Frequency);
                  setEvery((n) => String(Math.min(Number(n) || 1, INTERVAL_MAX[v as Frequency])));
                }}
              >
                <SelectTrigger className="w-32" aria-label="Frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">every</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={INTERVAL_MAX[freq]}
                value={every}
                onChange={(e) => setEvery(e.target.value)}
                className="h-8 w-16 tabular-nums"
                aria-label={`Every how many ${many}`}
              />
              <span className="text-muted-foreground">{Number(every) === 1 ? one : many}</span>
            </div>
            {freq === 'weekly' && (
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                spacing={1}
                value={weekdays.map(String)}
                onValueChange={(values) => setWeekdays(values.map(Number))}
                aria-label="Weekdays"
              >
                {WEEK_ORDER.map((d) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(d)}
                    aria-label={WEEKDAYS[d]}
                    className="w-10 text-xs"
                  >
                    {WEEKDAYS[d].slice(0, 2)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            {freq === 'monthly' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">on day</span>
                <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                  <SelectTrigger className="w-20" aria-label="Day of the month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dayOfMonth > 28 && (
                  <span className="text-xs text-muted-foreground">
                    Shorter months use their last day.
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor={`${uid}-start`} className="font-normal text-muted-foreground">
                Starting
              </Label>
              <Input
                id={`${uid}-start`}
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-8 w-40"
              />
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs" aria-live="polite">
              {parsed.ok ? (
                <>
                  <span className="font-medium">{describeSchedule(parsed.schedule)}.</span>{' '}
                  <span className="text-muted-foreground">
                    Next: {preview.map((d) => formatRunDay(d)).join(' · ') || 'none'}
                  </span>
                </>
              ) : (
                <span className="text-destructive">{parsed.error}</span>
              )}
            </div>
            {fieldError('schedule') && (
              <p role="alert" className="text-xs text-destructive">
                {fieldError('schedule')}
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Properties</span>
            <PropertyChips
              value={props}
              onChange={(patch) => setProps((current) => ({ ...current, ...patch }))}
              showDueDate={false}
            />
          </div>
          <Field
            id={`${uid}-due`}
            label="Due"
            hint="Days after each run; leave empty for no due date."
            error={fieldError('dueInDays')}
          >
            <div className="flex items-center gap-2 text-sm">
              <Input
                id={`${uid}-due`}
                type="number"
                inputMode="numeric"
                min={0}
                max={DUE_IN_DAYS_MAX}
                value={dueInDays}
                onChange={(e) => setDueInDays(e.target.value)}
                placeholder="—"
                className="h-8 w-20 tabular-nums"
              />
              <span className="text-muted-foreground">days after it’s created</span>
            </div>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !title.trim() || !parsed.ok}>
              {item ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
