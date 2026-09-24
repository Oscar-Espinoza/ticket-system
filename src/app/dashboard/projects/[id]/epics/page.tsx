// Stub — owned by B8

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Epics' };

export default function Page() {
  return (
    <ComingSoon
      title="Epics"
      description="Larger pieces of work made of many issues, with milestones."
    />
  );
}
