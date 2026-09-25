'use client';

// Owner: B12. Avatars of the other members viewing this issue right now
// (presence heartbeat, see project/slots/live-updates.tsx). Renders nothing
// when you're alone.

import { Avatar } from '@/components/ui-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectPresence } from '@/components/project/slots/live-updates';
import { isPendingIssue, type IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

const MAX_AVATARS = 3;

function names(list: string[]): string {
  if (list.length <= 2) return list.join(' and ');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

export function HeaderPresence({ issue }: { issue: IssueRow; mutations: IssueMutations }) {
  const pending = isPendingIssue(issue);
  const everyone = useProjectPresence(issue.projectId, pending ? null : issue.id);
  const viewers = pending ? [] : everyone.filter((u) => u.ticketId === issue.id);
  if (viewers.length === 0) return null;

  const label = `${names(viewers.map((v) => v.name))} ${viewers.length === 1 ? 'is' : 'are'} also viewing`;
  const extra = viewers.length - MAX_AVATARS;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="img" tabIndex={0} aria-label={label} className="mr-1 flex items-center -space-x-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {viewers.slice(0, MAX_AVATARS).map((v) => (
              <Avatar key={v.id} name={v.name} src={v.image} size={20} className="ring-2 ring-background" />
            ))}
            {extra > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
                +{extra}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
