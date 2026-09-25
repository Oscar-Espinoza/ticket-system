'use client';

// Cycle sidebar: progress per assignee / label over the cycle's current issues.

import { useState } from 'react';
import { UserRound } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui-icons';
import type { IssueRow } from '@/lib/issue-model';
import { UnitToggle } from './cycle-charts';
import { percent, type ChartUnit } from './cycle-utils';

interface Bucket {
  id: string;
  label: string;
  icon: React.ReactNode;
  total: number;
  done: number;
}

function bucketize(
  issues: IssueRow[],
  unit: ChartUnit,
  keys: (issue: IssueRow) => { id: string; label: string; icon: React.ReactNode }[],
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const issue of issues) {
    // Canceled issues are out of scope, like the burndown.
    if (issue.state.type === 'canceled') continue;
    const weight = unit === 'points' ? (issue.estimate ?? 0) : 1;
    const done = issue.state.type === 'completed';
    for (const key of keys(issue)) {
      const bucket = map.get(key.id) ?? { ...key, total: 0, done: 0 };
      bucket.total += weight;
      if (done) bucket.done += weight;
      map.set(key.id, bucket);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function BucketList({ buckets, unit, empty }: { buckets: Bucket[]; unit: ChartUnit; empty: string }) {
  if (buckets.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {buckets.map((b) => (
        <li key={b.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm">
            {b.icon}
            <span className="min-w-0 flex-1 truncate">{b.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {b.done}/{b.total}
              {unit === 'points' ? ' pts' : ''} · {percent(b.done, b.total)}%
            </span>
          </div>
          <div
            aria-hidden="true"
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${percent(b.done, b.total)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CycleBreakdown({
  issues,
  estimatesEnabled,
}: {
  issues: IssueRow[];
  estimatesEnabled: boolean;
}) {
  const [unit, setUnit] = useState<ChartUnit>('issues');
  const effective: ChartUnit = estimatesEnabled ? unit : 'issues';

  const assignees = bucketize(issues, effective, (issue) => [
    issue.assignee
      ? {
          id: issue.assignee.id,
          label: issue.assignee.name,
          icon: <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />,
        }
      : {
          id: '__none',
          label: 'Unassigned',
          icon: <UserRound className="size-5 text-muted-foreground" aria-hidden="true" />,
        },
  ]);
  const labels = bucketize(issues, effective, (issue) =>
    issue.labels.map((label) => ({
      id: label.id,
      label: label.name,
      icon: (
        <span
          aria-hidden="true"
          className="mx-1 size-2 shrink-0 rounded-full"
          style={{ background: label.color }}
        />
      ),
    })),
  );

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
      <Tabs defaultValue="assignees" className="gap-3">
        <div className="flex items-center gap-2">
          <TabsList variant="line" className="h-7">
            <TabsTrigger value="assignees" className="text-xs">
              Assignees
            </TabsTrigger>
            <TabsTrigger value="labels" className="text-xs">
              Labels
            </TabsTrigger>
          </TabsList>
          {estimatesEnabled && (
            <div className="ml-auto">
              <UnitToggle value={unit} onChange={setUnit} />
            </div>
          )}
        </div>
        <TabsContent value="assignees">
          <BucketList buckets={assignees} unit={effective} empty="No issues in this cycle." />
        </TabsContent>
        <TabsContent value="labels">
          <BucketList buckets={labels} unit={effective} empty="No labeled issues in this cycle." />
        </TabsContent>
      </Tabs>
    </section>
  );
}
