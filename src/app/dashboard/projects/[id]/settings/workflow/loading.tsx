import { Skeleton } from '@/components/ui-icons';

export default function WorkflowLoading() {
  return (
    <div role="status" aria-label="Loading workflow">
      <span className="sr-only">Loading workflow…</span>
      <Skeleton className="mb-2 h-6 w-28" />
      <Skeleton className="mb-8 h-4 w-80" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="mb-6">
          <Skeleton className="mb-2 h-4 w-24" />
          <Skeleton className="h-10" />
        </div>
      ))}
    </div>
  );
}
