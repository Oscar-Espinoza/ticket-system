'use client';

// /dashboard/dashboards: the viewer's dashboards, then ones shared into their
// projects. "New dashboard" (button + palette command) opens the create dialog.

import { useEffect, useEffectEvent, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, LayoutDashboard, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { deleteDashboard, duplicateDashboard } from '@/app/actions/dashboards';
import { relativeTime } from '@/components/issues/issue-properties';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, LabelChip } from '@/components/ui-icons';
import type { DashboardSummary } from '@/lib/dashboards';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { DashboardDetailsDialog } from './dashboard-details-dialog';
import { dashboardHref } from './widget-model';

export function NewDashboardButton({ projects }: { projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const onPalette = useEffectEvent(() => setOpen(true));
  useEffect(
    () =>
      registerPaletteCommands([
        {
          id: 'new-dashboard',
          label: 'New dashboard',
          section: 'Dashboards',
          keywords: ['create', 'insights', 'charts'],
          run: () => onPalette(),
        },
      ]),
    [],
  );
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        New dashboard
      </Button>
      <DashboardDetailsDialog open={open} onOpenChange={setOpen} projects={projects} />
    </>
  );
}

export function DashboardList({ dashboards }: { dashboards: DashboardSummary[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<DashboardSummary | null>(null);
  const [pending, startTransition] = useTransition();

  if (dashboards.length === 0) {
    return (
      <EmptyState
        icon={<LayoutDashboard />}
        title="No dashboards yet"
        description="Build numbers, charts and issue lists from filters — for one project or across all of yours."
      />
    );
  }

  const mine = dashboards.filter((d) => d.isOwner);
  const shared = dashboards.filter((d) => !d.isOwner);

  const duplicate = (dashboard: DashboardSummary) =>
    startTransition(async () => {
      const result = await duplicateDashboard({ id: dashboard.id });
      if (!result.ok) toast.error(result.error);
      else router.push(dashboardHref(result.id));
    });

  const section = (id: string, title: string, items: DashboardSummary[]) =>
    items.length > 0 && (
      <section aria-labelledby={id} className="flex flex-col gap-1">
        <h2 id={id} className="px-2 text-xs font-medium text-muted-foreground">
          {title}
        </h2>
        <ul className="flex flex-col gap-px">
          {items.map((dashboard) => (
            <li
              key={dashboard.id}
              className="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent/40 focus-within:bg-accent/40"
            >
              <Link
                href={dashboardHref(dashboard.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{dashboard.name}</span>
                  {dashboard.description && (
                    <span className="truncate text-xs text-muted-foreground">{dashboard.description}</span>
                  )}
                </span>
                <LabelChip dot={false} className="hidden max-w-40 truncate sm:inline-flex">
                  {dashboard.projectName ?? 'All projects'}
                </LabelChip>
                {dashboard.shared && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Shared with project members">
                    <Users className="size-3.5" aria-hidden="true" />
                    <span className="hidden md:inline">Shared</span>
                  </span>
                )}
                <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:block">
                  {dashboard.widgetCount} widget{dashboard.widgetCount === 1 ? '' : 's'}
                </span>
                <span className="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground md:block">
                  {dashboard.isOwner ? 'You' : (dashboard.ownerName ?? 'Former member')}
                </span>
                <time
                  dateTime={new Date(dashboard.updatedAt).toISOString()}
                  title={`Updated ${new Date(dashboard.updatedAt).toLocaleString()}`}
                  suppressHydrationWarning
                  className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
                >
                  {relativeTime(dashboard.updatedAt)}
                </time>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${dashboard.name}`} disabled={pending}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => duplicate(dashboard)}>
                    <Copy />
                    Duplicate
                  </DropdownMenuItem>
                  {dashboard.isOwner && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(dashboard)}>
                        <Trash2 />
                        Delete…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      {section('dashboards-mine', 'Your dashboards', mine)}
      {section('dashboards-shared', 'Shared with you', shared)}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.shared ? 'Project members will lose access too. ' : ''}This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = deleting;
                if (!target) return;
                startTransition(async () => {
                  const result = await deleteDashboard({ id: target.id });
                  if (!result.ok) toast.error(result.error);
                  else {
                    toast.success('Dashboard deleted');
                    router.refresh();
                  }
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
