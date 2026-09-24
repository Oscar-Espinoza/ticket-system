// Stub — owned by B8

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Roadmap' };

export default function Page() {
  return (
    <ComingSoon
      title="Roadmap"
      description="Epics on a timeline."
    />
  );
}
