'use client';

// Pulse tab: this week's numbers per project, then the epic update feed
// (newest first) across the viewer's projects.

import Link from 'next/link';
import { Activity, ArrowRight } from 'lucide-react';

import { epicPath } from '@/components/epics/epic-model';
import { EpicIcon, HealthChip } from '@/components/epics/epic-glyphs';
import { relativeTime } from '@/components/issues/issue-properties';
import { Avatar, EmptyState } from '@/components/ui-icons';
import type { Pulse } from '@/lib/pulse';

export function PulseFeed({ pulse, days }: { pulse: Pulse; days: number }) {
  const active = pulse.projects.filter((p) => p.created + p.completed + p.updates > 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="pulse-week" className="flex flex-col gap-2">
        <h2 id="pulse-week" className="px-2 text-xs font-medium text-muted-foreground">
          Last 7 days
        </h2>
        {active.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No issues created or completed in your projects this week.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((project) => (
              <li key={project.projectId}>
                <Link
                  href={`/dashboard/projects/${project.projectId}/insights`}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{project.projectName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{project.projectKey}</span>
                  </span>
                  <span className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      <span className="text-base font-medium text-foreground tabular-nums">{project.completed}</span> completed
                    </span>
                    <span>
                      <span className="text-base font-medium text-foreground tabular-nums">{project.created}</span> created
                    </span>
                    <span>
                      <span className="text-base font-medium text-foreground tabular-nums">{project.updates}</span>{' '}
                      {project.updates === 1 ? 'update' : 'updates'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pulse-updates" className="flex flex-col gap-2">
        <h2 id="pulse-updates" className="px-2 text-xs font-medium text-muted-foreground">
          Epic updates · last {days} days
        </h2>
        {pulse.updates.length === 0 ? (
          <EmptyState
            icon={<Activity />}
            title="No epic updates yet"
            description="Post an update on an epic (health + a short note) and it shows up here and in everyone's weekly pulse."
          />
        ) : (
          <ol className="flex flex-col">
            {pulse.updates.map((update) => (
              <li key={update.id} className="flex gap-3 border-b border-border/60 px-2 py-3 last:border-b-0">
                <Avatar name={update.authorName ?? 'Former member'} src={update.authorImage} size={24} className="mt-0.5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <Link
                      href={epicPath(update.projectId, update.epicId)}
                      className="flex min-w-0 items-center gap-1.5 font-medium hover:underline"
                    >
                      <EpicIcon color={update.epicColor} />
                      <span className="truncate">{update.epicName}</span>
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{update.projectKey}</span>
                    {update.previousHealth && update.previousHealth !== update.health && (
                      <>
                        <HealthChip health={update.previousHealth} className="opacity-60" />
                        <ArrowRight className="size-3 text-muted-foreground" aria-label="changed to" />
                      </>
                    )}
                    <HealthChip health={update.health} />
                    <time
                      dateTime={new Date(update.createdAt).toISOString()}
                      title={new Date(update.createdAt).toLocaleString()}
                      suppressHydrationWarning
                      className="ml-auto text-xs text-muted-foreground tabular-nums"
                    >
                      {relativeTime(update.createdAt)}
                    </time>
                  </div>
                  {update.excerpt && <p className="line-clamp-3 text-sm text-muted-foreground">{update.excerpt}</p>}
                  <p className="text-xs text-muted-foreground">{update.authorName ?? 'Former member'}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
