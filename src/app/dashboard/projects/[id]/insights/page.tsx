// Stub — owned by B12

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Insights' };

export default function Page() {
  return (
    <ComingSoon
      title="Insights"
      description="Charts and analytics for this project's issues."
    />
  );
}
