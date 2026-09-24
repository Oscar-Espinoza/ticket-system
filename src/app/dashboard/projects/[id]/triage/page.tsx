// Stub — owned by B7

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Triage' };

export default function Page() {
  return (
    <ComingSoon
      title="Triage"
      description="New and incoming issues waiting to be accepted into the workflow."
    />
  );
}
