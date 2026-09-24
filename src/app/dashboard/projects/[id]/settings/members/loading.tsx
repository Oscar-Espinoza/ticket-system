import { Skeleton } from '@/components/ui-icons';

export default function MembersLoading() {
  return (
    <div role="status" aria-label="Loading members">
      <span className="sr-only">Loading members…</span>
      <Skeleton className="mb-6 h-5 w-32" />
      <Skeleton className="mb-8 h-6 w-28" />
      <Skeleton variant="card" className="mb-6" />
      <Skeleton className="mb-4 h-5 w-36" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
