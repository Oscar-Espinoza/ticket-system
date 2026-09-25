'use client';

// Cross-project issue list grouped by workflow state *type* (projects have
// different states, but the categories are shared). Closed groups start
// collapsed; "Hide completed" drops them entirely.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusIcon } from '@/components/ui-icons';
import { STATE_TYPE_LABEL, type IssueRow, type StateType } from '@/lib/issue-model';
import { isClosed } from '@/lib/workflow';
import { NavList } from './list-navigation';
import { NavIssueRow } from './nav-issue-row';

const GROUP_ORDER: StateType[] = ['started', 'unstarted', 'backlog', 'triage', 'completed', 'canceled'];

const GROUP_LABEL: Record<StateType, string> = {
  ...STATE_TYPE_LABEL,
  started: 'In progress',
  unstarted: 'Todo',
};

export function IssueGroups({
  issues,
  projectNames,
}: {
  issues: IssueRow[];
  /** projectId → name, for the project chip. */
  projectNames: Record<string, string>;
}) {
  const [hideCompleted, setHideCompleted] = useState(false);

  const groups = GROUP_ORDER.filter((type) => !(hideCompleted && isClosed(type)))
    .map((type) => ({ type, issues: issues.filter((issue) => issue.state.type === type) }))
    .filter((group) => group.issues.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <Switch id="hide-completed" size="sm" checked={hideCompleted} onCheckedChange={setHideCompleted} />
        <Label htmlFor="hide-completed" className="text-xs font-normal text-muted-foreground">
          Hide completed
        </Label>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Every issue here is completed or canceled.
        </p>
      ) : (
        <NavList className="flex flex-col gap-2">
          {groups.map((group) => (
            <Collapsible key={group.type} defaultOpen={!isClosed(group.type)}>
              <CollapsibleTrigger className="group/trigger flex h-8 w-full items-center gap-2 rounded-md bg-muted/50 px-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-90" />
                <StatusIcon type={group.type} size={14} />
                {GROUP_LABEL[group.type]}
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {group.issues.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 flex flex-col gap-px">
                {group.issues.map((issue) => (
                  <NavIssueRow key={issue.id} issue={issue} project={projectNames[issue.projectId]} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </NavList>
      )}
    </div>
  );
}
