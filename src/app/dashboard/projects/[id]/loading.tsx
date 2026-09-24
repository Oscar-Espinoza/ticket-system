import { Skeleton } from '@/components/ui-icons';

export default function ProjectLoading() {
  return (
    <div role="status" aria-label="Loading issues">
      <span className="sr-only">Loading issues…</span>
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="ml-auto h-7 w-24" />
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    </div>
  );
}
