// Empty state for a planning feature that is turned off in project settings.

import type { ReactNode } from 'react';
import Link from 'next/link';

import { projectHref } from '@/components/app-shell/routes';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';

export function FeatureOffState({
  projectId,
  icon,
  title,
  description,
  canEnable,
}: {
  projectId: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** Admins get the settings link; everyone else is told who can. */
  canEnable: boolean;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={canEnable ? description : `${description} Ask a project admin to turn it on.`}
      action={
        canEnable ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={projectHref(projectId, 'settings/planning')}>Enable in settings</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
