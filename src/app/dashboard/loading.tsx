// Dashboard loading UI (M4 skeleton path — docs/mimo-refactor/M4-visual-system.md).
//
// Next.js convention: this file wraps `page.tsx` in a Suspense boundary inside
// the dashboard layout (the shell chrome stays interactive while data streams).
// It mirrors the loaded structure — greeting line, GitHub chip, section header
// + CTA, then one C4 Skeleton per project row — so the swap is jitter-free.
//
// Shimmer/motion comes entirely from the C4 Skeleton primitive (co-located CSS
// module; prefers-reduced-motion aware). globals.css (C1) is untouched.

import { Skeleton } from '@/components/ui-icons';

export default function DashboardLoading() {
  return (
    <div className="mt-8" role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard…</span>

      {/* Greeting line (text-xl) + GitHub chip (h-5) */}
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-3 h-5 w-44" />

      {/* Section header + "New project" CTA row */}
      <div className="mb-4 mt-8 flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>

      {/* Project rows — flush, one Skeleton per potential row */}
      <div className="flex flex-col">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}
