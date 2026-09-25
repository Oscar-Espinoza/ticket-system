import { Skeleton } from '@/components/ui-icons';

export default function CyclesLoading() {
  return (
    <div role="status" aria-label="Loading cycles" className="flex flex-col gap-6">
      <span className="sr-only">Loading cycles…</span>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="ml-auto h-7 w-28" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    </div>
  );
}
