'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { revokeOAuthConsent } from '@/app/actions/oauth-apps';
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
import { EmptyState } from '@/components/ui-icons';
import { AppIcon } from './app-icon';
import { describeScope, type AuthorizedAppView } from './oauth-model';

/** Apps the user granted access to (OAuth consents), with Revoke. */
export function AuthorizedApps({ apps: initial }: { apps: AuthorizedAppView[] }) {
  const [apps, setApps] = useState(initial);
  const [revoking, setRevoking] = useState<AuthorizedAppView | null>(null);
  const [, startTransition] = useTransition();

  function revoke(app: AuthorizedAppView) {
    startTransition(async () => {
      const result = await revokeOAuthConsent({ id: app.id });
      if (result.ok) {
        setApps((prev) => prev.filter((a) => a.id !== app.id));
        toast.success(`Revoked ${app.name}`);
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Authorized apps</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Apps that can access your account. Revoking signs them out everywhere.
        </p>
      </div>

      {apps.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-10"
          icon={<ShieldCheck />}
          title="No authorized apps"
          description="Apps you allow through “Sign in with Ticket System” show up here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {apps.map((app) => (
            <li key={app.id} className="flex items-center gap-3 px-3 py-2.5">
              <AppIcon name={app.name} src={app.icon} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {app.uri ? (
                    <a href={app.uri} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                      {app.name}
                    </a>
                  ) : (
                    app.name
                  )}
                </p>
                <p
                  className="mt-0.5 truncate text-xs text-muted-foreground"
                  title={app.scopes.map(describeScope).join('\n')}
                >
                  {app.scopes.includes('write')
                    ? 'Read and write access'
                    : app.scopes.includes('read')
                      ? 'Read access'
                      : 'Basic profile'}
                  {' · authorized '}
                  {relativeTime(new Date(app.grantedAt))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevoking(app)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!revoking} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its access and refresh tokens stop working immediately. You can authorize it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => revoking && revoke(revoking)}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
