'use client';

// Owner: B6. Rendered at the end of the issues toolbar (before "New issue"):
// "Save view" on the project issues page; "Update view" / "Save as new" on a
// saved view page (known through our SavedViewProvider, else IssuesView's
// view context or the `savedView` prop).
// Cycle / epic pages list a scoped subset a view wouldn't capture, so they get
// nothing here.

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BookmarkPlus, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { updateView } from '@/app/actions/views';
import { normalizeDisplayOptions, useDisplayOptions } from '@/components/issues/display-options';
import { useIssueFilters } from '@/components/issues/issue-filters';
import { SaveViewDialog } from '@/components/navigation/save-view-dialog';
import { canonicalJson, useSavedView } from '@/components/navigation/saved-view-context';
import { useOptionalProjectData } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { useSavedView as useShownSavedView } from '@/components/views/view-context';
import { normalizeIssueFilters } from '@/lib/issue-filtering';
import type { IssueRow } from '@/lib/issue-model';
import { roleAllows } from '@/lib/roles';

type Json = Record<string, unknown>;

export function ToolbarExtra({
  issues,
  savedView,
}: {
  /** The currently listed issues. */
  issues: IssueRow[];
  savedView?: { id: string; name: string } | null;
}) {
  void issues;
  const data = useOptionalProjectData();
  const pathname = usePathname();
  const router = useRouter();
  const openView = useSavedView();
  // IssuesView's own record of a shown saved view (when not opened via our page).
  const shownView = useShownSavedView() ?? savedView ?? null;
  const filters = useIssueFilters() as unknown as Json;
  const [display] = useDisplayOptions();
  const [dialog, setDialog] = useState(0); // >0 = open; bumps remount the form
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  if (!data) return null;
  const canShare = roleAllows(data.project.role, 'write');
  const onIssuesPage = pathname === `/dashboard/projects/${data.project.id}`;
  const onViewPage = openView !== null || shownView !== null;
  if (!onIssuesPage && !onViewPage) return null;

  const current = { filters, display: display as unknown as Json };
  // Normalize both sides: stored JSON may lack fields added since it was saved.
  const dirty =
    openView !== null &&
    (canonicalJson(normalizeIssueFilters(openView.filters)) !==
      canonicalJson(normalizeIssueFilters(current.filters)) ||
      canonicalJson(normalizeDisplayOptions(openView.display)) !==
        canonicalJson(normalizeDisplayOptions(current.display)));

  const openDialog = () => {
    setDialog((n) => n + 1);
    setOpen(true);
  };

  const update = () => {
    if (!openView) return;
    startSaving(async () => {
      const result = await updateView({ id: openView.id, ...current });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Updated “${openView.name}”`);
      router.refresh();
    });
  };

  return (
    <>
      {openView?.isOwner && (
        <Button
          size="sm"
          variant={dirty ? 'secondary' : 'ghost'}
          disabled={!dirty || saving}
          title={dirty ? 'Save the current filters and display to this view' : 'No unsaved changes'}
          onClick={update}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Update view
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={openDialog}>
        <BookmarkPlus />
        {onViewPage ? 'Save as new' : 'Save view'}
      </Button>
      {dialog > 0 && (
        <SaveViewDialog
          key={dialog}
          open={open}
          onOpenChange={setOpen}
          projectId={data.project.id}
          filters={current.filters}
          display={current.display}
          canShare={canShare}
          defaultName={onViewPage ? `${openView?.name ?? shownView?.name ?? 'View'} (copy)` : ''}
        />
      )}
    </>
  );
}
