'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Something went wrong"
      description="This page failed to load. Try again, or come back in a moment."
      action={
        <Button size="sm" variant="outline" onClick={() => unstable_retry()}>
          Try again
        </Button>
      }
    />
  );
}
