import { Skeleton } from '@/components/ui-icons';

export default function PersonLoading() {
  return (
    <div role="status" aria-label="Loading profile" className="mx-auto flex max-w-3xl flex-col gap-10">
      <span className="sr-only">Loading profile…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      {[2, 4, 5].map((rows, i) => (
        <div key={i}>
          <Skeleton className="mb-3 h-5 w-36" />
          <div className="flex flex-col gap-1">
            {Array.from({ length: rows }, (_, j) => (
              <Skeleton key={j} className="h-10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
