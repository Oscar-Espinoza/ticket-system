'use client';

// Owner: B8 / D4b. "Epic" + "Milestone" property rows of IssueDetail. This
// project's epics come from project data (non-archived); epics of sibling
// projects in the workspace (cross-project epics) load lazily from the server
// — on picker open, or when the issue already points at a non-local epic.
// Clearing or changing the epic drops the milestone — the issue service and
// applyIssuePatch both do it.

import { useState } from 'react';
import Link from 'next/link';
import { Boxes } from 'lucide-react';

import { EpicIcon, MilestoneGlyph } from '@/components/epics/epic-glyphs';
import { epicPath, type ForeignEpicOption } from '@/components/epics/epic-model';
import { EpicPicker, MilestonePicker } from '@/components/epics/epic-pickers';
import { useForeignEpics } from '@/components/epics/foreign-epics-store';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import type { IssueRow } from '@/lib/issue-model';
import { PropertyRow } from '../property-row';

function PropertyButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 max-w-full gap-2 font-normal" {...props} />
  );
}

function groupByProject(epics: ForeignEpicOption[]) {
  const groups = new Map<string, { project: ForeignEpicOption['project']; epics: ForeignEpicOption[] }>();
  for (const epic of epics) {
    const group = groups.get(epic.project.id) ?? { project: epic.project, epics: [] };
    group.epics.push(epic);
    groups.set(epic.project.id, group);
  }
  return [...groups.values()];
}

export function PropertyEpic({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const { epics, project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const [pickerOpen, setPickerOpen] = useState(false);

  const localEpic = epics.find((e) => e.id === issue.epicId) ?? null;
  const inWorkspace = Boolean(project.workspaceId);
  const needsForeign = inWorkspace && Boolean(issue.epicId) && !localEpic;
  // Without local epics the row's visibility depends on the foreign list.
  const foreign = useForeignEpics(
    project.id,
    inWorkspace && (pickerOpen || needsForeign || epics.length === 0),
  );
  const foreignEpic = needsForeign ? (foreign?.find((e) => e.id === issue.epicId) ?? null) : null;
  const epic = localEpic ?? foreignEpic;
  const milestone = epic?.milestones.find((m) => m.id === issue.milestoneId) ?? null;

  // Nothing to show or pick: keep the panel quiet.
  if (!issue.epicId && epics.length === 0 && !foreign?.length) return null;

  const epicTrigger = (
    <PropertyButton disabled={!canWrite}>
      {epic ? (
        <>
          <EpicIcon color={epic.color} />
          <span className="truncate">{epic.name}</span>
          {foreignEpic && (
            <span
              className="shrink-0 font-mono text-[10px] text-muted-foreground"
              title={`Epic in ${foreignEpic.project.name}`}
            >
              {foreignEpic.project.ticketKey}
            </span>
          )}
        </>
      ) : (
        <>
          <Boxes className="text-muted-foreground" />
          <span className="text-muted-foreground">
            {!issue.epicId
              ? 'Add to epic'
              : needsForeign && foreign === undefined
                ? 'Loading…'
                : // Archived (not in project data), or an epic of a project the viewer can't see.
                  'Archived epic'}
          </span>
        </>
      )}
    </PropertyButton>
  );

  // Local epics (archived ones included) live under this project; a foreign
  // one only links once we know its project.
  const epicHref = foreignEpic
    ? epicPath(foreignEpic.project.id, foreignEpic.id)
    : issue.epicId && (localEpic || !inWorkspace)
      ? epicPath(project.id, issue.epicId)
      : null;

  return (
    <>
      <PropertyRow label="Epic">
        <div className="flex min-w-0 items-center">
          {canWrite ? (
            <EpicPicker
              value={issue.epicId}
              epics={epics}
              otherProjects={groupByProject(foreign ?? [])}
              loadingOthers={inWorkspace && foreign === undefined}
              onOpenChange={setPickerOpen}
              onChange={(epicId) => mutations.update(issue, { epicId })}
            >
              {epicTrigger}
            </EpicPicker>
          ) : (
            epicTrigger
          )}
          {epicHref && (
            <Link
              href={epicHref}
              className="ml-1 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Open
            </Link>
          )}
        </div>
      </PropertyRow>

      {epic && (epic.milestones.length > 0 || milestone) && (
        <PropertyRow label="Milestone">
          {(() => {
            const trigger = (
              <PropertyButton disabled={!canWrite}>
                <MilestoneGlyph className="text-muted-foreground" />
                {milestone ? (
                  <span className="truncate">{milestone.name}</span>
                ) : (
                  <span className="text-muted-foreground">Add milestone</span>
                )}
              </PropertyButton>
            );
            return canWrite ? (
              <MilestonePicker
                value={issue.milestoneId}
                milestones={epic.milestones}
                onChange={(milestoneId) => mutations.update(issue, { milestoneId })}
              >
                {trigger}
              </MilestonePicker>
            ) : (
              trigger
            );
          })()}
        </PropertyRow>
      )}
    </>
  );
}
