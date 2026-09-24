import Link from 'next/link';
import { FolderX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';

export default function ProjectNotFound() {
  return (
    <EmptyState
      icon={<FolderX />}
      title="Project not found"
      description="It doesn't exist, or you're not a member of it."
      action={
        <Button size="sm" variant="outline" asChild>
          <Link href="/dashboard">Back to projects</Link>
        </Button>
      }
    />
  );
}
