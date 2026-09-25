'use client';

// A dashboard: header (name, scope, sharing, actions) and a responsive grid of
// widgets. The owner edits in place — every change is applied optimistically
// and saved with updateDashboard (reverted with a toast if it fails).

import { useEffect, useEffectEvent, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  LayoutDashboard,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteDashboard,
  duplicateDashboard,
  updateDashboard,
} from '@/app/actions/dashboards';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui-icons';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { cn } from '@/lib/utils';
import { DashboardDetailsDialog } from './dashboard-details-dialog';
import { WidgetBody } from './widget-body';
import { WidgetEditor } from './widget-editor';
import {
  MAX_WIDGETS,
  WIDGET_SIZES,
  WIDGET_TYPES,
  WIDGET_TYPE_DESCRIPTION,
  WIDGET_TYPE_LABEL,
  dashboardHref,
  newWidget,
  normalizeWidgets,
  sizeOf,
  type DashboardDataset,
  type DashboardRecord,
  type Widget,
  type WidgetType,
} from './widget-model';

// Grid: 1 column on phones, 2 from md, 4 from xl; rows are 13rem.
const SPAN: Record<string, string> = {
  s: 'col-span-1 row-span-1',
  m: 'col-span-1 md:col-span-2 row-span-1',
  l: 'col-span-1 md:col-span-2 row-span-2',
  xl: 'col-span-1 md:col-span-2 xl:col-span-4 row-span-2',
};

export function DashboardView({
  dashboard,
  dataset,
  isOwner,
  canShare,
}: {
  dashboard: DashboardRecord;
  dataset: DashboardDataset;
  isOwner: boolean;
  /** Owner with write access to the dashboard's project. */
  canShare: boolean;
}) {
  const router = useRouter();
  const [widgets, setWidgets] = useState(dashboard.widgets);
  const [shared, setShared] = useState(dashboard.shared);
  const [editing, setEditing] = useState<Widget | null>(null);
  const [details, setDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // One "now" per render pass keeps every widget consistent.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const save = (next: Widget[]) => {
    const previous = widgets;
    const normalized = normalizeWidgets(next);
    setWidgets(normalized);
    startTransition(async () => {
      const result = await updateDashboard({ id: dashboard.id, widgets: normalized });
      if (!result.ok) {
        setWidgets(previous);
        toast.error(result.error);
      }
    });
  };

  const addWidget = (type: WidgetType) => {
    if (widgets.length >= MAX_WIDGETS) {
      toast.error(`A dashboard holds up to ${MAX_WIDGETS} widgets.`);
      return;
    }
    const widget = newWidget(type);
    save([...widgets, widget]);
    setEditing(widget);
  };

  const replace = (widget: Widget) => save(widgets.map((w) => (w.id === widget.id ? widget : w)));
  const remove = (widget: Widget) => save(widgets.filter((w) => w.id !== widget.id));
  const move = (widget: Widget, delta: number) => {
    const index = widgets.findIndex((w) => w.id === widget.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  const toggleShared = (value: boolean) => {
    setShared(value);
    startTransition(async () => {
      const result = await updateDashboard({ id: dashboard.id, shared: value });
      if (!result.ok) {
        setShared(!value);
        toast.error(result.error);
      } else {
        toast.success(value ? 'Shared with project members' : 'Dashboard is now private');
      }
    });
  };

  const duplicate = () =>
    startTransition(async () => {
      const result = await duplicateDashboard({ id: dashboard.id });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success('Dashboard duplicated');
        router.push(dashboardHref(result.id));
      }
    });

  const onPaletteAdd = useEffectEvent(() => addWidget('number'));
  useEffect(() => {
    if (!isOwner) return;
    return registerPaletteCommands([
      {
        id: 'dashboard-add-widget',
        label: 'Add widget to dashboard',
        section: 'Dashboards',
        keywords: ['chart', 'number', 'insights'],
        run: () => onPaletteAdd(),
      },
    ]);
  }, [isOwner]);

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus />
          Add widget
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {WIDGET_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => addWidget(type)} className="flex-col items-start gap-0">
            <span>{WIDGET_TYPE_LABEL[type]}</span>
            <span className="text-xs text-muted-foreground">{WIDGET_TYPE_DESCRIPTION[type]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <Link href="/dashboard/dashboards" className="hover:text-foreground">
              Dashboards
            </Link>
          </nav>
          <h1 className="flex items-center gap-2 truncate text-xl font-medium">
            <LayoutDashboard className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{dashboard.name}</span>
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {dashboard.projectName ?? 'All your projects'}
            {!isOwner && ` · shared by ${dashboard.ownerName ?? 'a former member'}`}
            {dashboard.description && ` · ${dashboard.description}`}
          </p>
        </div>

        <div className={cn('flex items-center gap-2 transition-opacity', pending && 'opacity-70')}>
          {isOwner && dashboard.projectId && (
            <div className="flex items-center gap-2" title={canShare ? undefined : 'Needs edit access to the project'}>
              <Switch
                id="dashboard-shared"
                size="sm"
                checked={shared}
                disabled={!canShare && !shared}
                onCheckedChange={toggleShared}
              />
              <Label htmlFor="dashboard-shared" className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" />
                Shared
              </Label>
            </div>
          )}
          {isOwner && addMenu}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Dashboard actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwner && (
                <DropdownMenuItem onSelect={() => setDetails(true)}>
                  <Pencil />
                  Rename…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={duplicate}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {dataset.truncated && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Showing the most recent 5,000 issues — older issues aren’t counted.
        </p>
      )}

      {widgets.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard />}
          title="No widgets yet"
          description={
            isOwner
              ? 'Add numbers, charts and issue lists built from filters.'
              : 'The owner hasn’t added any widgets yet.'
          }
          action={isOwner ? addMenu : undefined}
        />
      ) : (
        <div className="grid auto-rows-[13rem] grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {widgets.map((widget, index) => (
            <section
              key={widget.id}
              aria-label={widget.title}
              className={cn(
                'group/widget flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4',
                SPAN[sizeOf(widget)],
              )}
            >
              <header className="flex items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
                  {isOwner ? (
                    <button
                      type="button"
                      className="max-w-full truncate rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setEditing(widget)}
                    >
                      {widget.title}
                    </button>
                  ) : (
                    widget.title
                  )}
                </h2>
                {isOwner && (
                  <WidgetMenu
                    widget={widget}
                    first={index === 0}
                    last={index === widgets.length - 1}
                    onEdit={() => setEditing(widget)}
                    onResize={(size) => {
                      const preset = WIDGET_SIZES.find((s) => s.id === size)!;
                      replace({ ...widget, w: preset.w, h: preset.h });
                    }}
                    onMove={(delta) => move(widget, delta)}
                    onDuplicate={() => {
                      const copy = { ...widget, id: crypto.randomUUID(), title: `${widget.title} (copy)` };
                      const next = [...widgets];
                      next.splice(index + 1, 0, copy);
                      save(next);
                    }}
                    onRemove={() => remove(widget)}
                  />
                )}
              </header>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <WidgetBody widget={widget} dataset={dataset} now={now} />
              </div>
            </section>
          ))}
        </div>
      )}

      <WidgetEditor
        widget={editing}
        dataset={dataset}
        scopeProjectId={dashboard.projectId}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(widget) => {
          replace(widget);
          setEditing(null);
          setNow(Date.now());
        }}
      />

      {isOwner && (
        <DashboardDetailsDialog
          open={details}
          onOpenChange={setDetails}
          dashboard={dashboard}
          onSaved={() => router.refresh()}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{dashboard.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {shared ? 'Project members will lose access too. ' : ''}This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteDashboard({ id: dashboard.id });
                  if (!result.ok) toast.error(result.error);
                  else {
                    toast.success('Dashboard deleted');
                    router.push('/dashboard/dashboards');
                  }
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WidgetMenu({
  widget,
  first,
  last,
  onEdit,
  onResize,
  onMove,
  onDuplicate,
  onRemove,
}: {
  widget: Widget;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onResize: (size: string) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${widget.title}`}
          className="opacity-0 group-hover/widget:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit…
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Maximize2 />
            Size
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sizeOf(widget)} onValueChange={onResize}>
              {WIDGET_SIZES.map((size) => (
                <DropdownMenuRadioItem key={size.id} value={size.id}>
                  {size.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
          <ArrowLeft />
          Move earlier
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
          <ArrowRight />
          Move later
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
