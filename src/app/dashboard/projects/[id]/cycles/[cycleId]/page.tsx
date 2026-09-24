// Stub — owned by B7

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Cycle' };

export default function Page() {
  return (
    <ComingSoon
      title="Cycle"
      description="Issues, scope and progress for this cycle."
    />
  );
}
