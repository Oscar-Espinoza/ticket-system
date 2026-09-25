'use client';

// Settings → Security → Sessions: every signed-in device, newest activity
// first; revoke one or all others. Revocation goes through server actions
// that map the session id to its token server-side.

import { useState, useTransition } from 'react';
import { Laptop, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { revokeOtherSessions, revokeSession } from '@/app/actions/security';
import { relativeTime } from '@/components/issues/issue-properties';
import { Button } from '@/components/ui/button';
import { LabelChip } from '@/components/ui-icons';
import { describeUserAgent, isMobileUserAgent } from './user-agent';

export interface SessionView {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  /** ISO strings. */
  createdAt: string;
  updatedAt: string;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function SessionsList({
  sessions: initial,
  currentId,
}: {
  sessions: SessionView[];
  currentId: string;
}) {
  const [sessions, setSessions] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAll, startAll] = useTransition();
  const others = sessions.filter((s) => s.id !== currentId);

  async function revoke(id: string) {
    setPendingId(id);
    const result = await revokeSession({ sessionId: id });
    setPendingId(null);
    if (result.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success('Session signed out');
    } else toast.error(result.error);
  }

  function revokeAll() {
    startAll(async () => {
      const result = await revokeOtherSessions();
      if (result.ok) {
        setSessions((prev) => prev.filter((s) => s.id === currentId));
        toast.success('Signed out of all other sessions');
      } else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sessions.map((session) => {
          const current = session.id === currentId;
          const Icon = isMobileUserAgent(session.userAgent) ? Smartphone : Laptop;
          return (
            <li key={session.id} className="flex items-center gap-3 px-4 py-2.5">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm">
                  {describeUserAgent(session.userAgent)}
                  {current && <LabelChip color="primary">This device</LabelChip>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    session.ipAddress,
                    current ? 'Active now' : `Active ${relativeTime(new Date(session.updatedAt))}`,
                    `Signed in ${dateFormat.format(new Date(session.createdAt))}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {!current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingId === session.id}
                  onClick={() => revoke(session.id)}
                >
                  {pendingId === session.id && <Loader2 className="animate-spin" />}
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Signed-out devices lose access within 5 minutes.
        </p>
        {others.length > 0 && (
          <Button variant="outline" size="sm" disabled={pendingAll} onClick={revokeAll}>
            {pendingAll && <Loader2 className="animate-spin" />}
            Sign out other sessions
          </Button>
        )}
      </div>
    </div>
  );
}
