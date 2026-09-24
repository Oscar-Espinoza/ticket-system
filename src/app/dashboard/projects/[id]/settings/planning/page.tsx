// Stub — owned by B7

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Cycles & triage' };

export default function Page() {
  return (
    <ComingSoon
      title="Cycles & triage"
      description="Cycle cadence, triage and estimates."
    />
  );
}
