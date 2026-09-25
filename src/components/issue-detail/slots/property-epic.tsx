'use client';

// Owner: B8. "Epic" + "Milestone" property rows of IssueDetail. Epics and their
// milestones come from project data (non-archived). Clearing or changing the
// epic drops the milestone — the issue service and applyIssuePatch both do it.

import Link from 'next/link';
import { Boxes } from 'lucide-react';

import { EpicIcon, MilestoneGlyph } from '@/components/epics/epic-glyphs';
import { epicPath } from '@/components/epics/epic-model';
import { EpicPicker, MilestonePicker } from '@/components/epics/epic-pickers';
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

export function PropertyEpic({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const { epics, project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const epic = epics.find((e) => e.id === issue.epicId) ?? null;
  const milestone = epic?.milestones.find((m) => m.id === issue.milestoneId) ?? null;

  // Nothing to show or pick: keep the panel quiet.
  if (epics.length === 0 && !issue.epicId) return null;

  const epicTrigger = (
    <PropertyButton disabled={!canWrite}>
      {epic ? (
        <>
          <EpicIcon color={epic.color} />
          <span className="truncate">{epic.name}</span>
        </>
      ) : (
        <>
          <Boxes className="text-muted-foreground" />
          <span className="text-muted-foreground">
            {/* An archived epic isn't in project data. */}
            {issue.epicId ? 'Archived epic' : 'Add to epic'}
          </span>
        </>
      )}
    </PropertyButton>
  );

  return (
    <>
      <PropertyRow label="Epic">
        <div className="flex min-w-0 items-center">
          {canWrite ? (
            <EpicPicker
              value={issue.epicId}
              epics={epics}
              onChange={(epicId) => mutations.update(issue, { epicId })}
            >
              {epicTrigger}
            </EpicPicker>
          ) : (
            epicTrigger
          )}
          {issue.epicId && (
            <Link
              href={epicPath(project.id, issue.epicId)}
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
