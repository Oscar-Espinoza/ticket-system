// Stub — owned by B7

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Cycles' };

export default function Page() {
  return (
    <ComingSoon
      title="Cycles"
      description="Time-boxed iterations with burndown and velocity."
    />
  );
}
