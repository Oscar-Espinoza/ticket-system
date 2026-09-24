// Placeholder body for routes whose feature lands in a later wave. Owners
// replace the whole page; nothing should import this once all routes ship.

import { Hammer } from 'lucide-react';

import { EmptyState } from '@/components/ui-icons';

export function ComingSoon({
  title,
  description = 'This page is being built.',
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col">
      <h1 className="mb-2 text-xl font-medium">{title}</h1>
      <EmptyState icon={<Hammer />} title="Coming soon" description={description} />
    </div>
  );
}
