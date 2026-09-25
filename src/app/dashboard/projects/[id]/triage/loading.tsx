import { Skeleton } from '@/components/ui-icons';

export default function TriageLoading() {
  return (
    <div role="status" aria-label="Loading triage" className="flex flex-col gap-1">
      <span className="sr-only">Loading triage…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} />
      ))}
    </div>
  );
}
