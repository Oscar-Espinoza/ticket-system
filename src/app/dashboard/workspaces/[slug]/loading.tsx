import { Skeleton } from '@/components/ui-icons';

export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading workspace" className="mx-auto flex max-w-3xl flex-col gap-10">
      <span className="sr-only">Loading workspace…</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-5 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      {[3, 4].map((rows, i) => (
        <div key={i}>
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="flex flex-col gap-1">
            {Array.from({ length: rows }, (_, j) => (
              <Skeleton key={j} className="h-11" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
