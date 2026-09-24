// Stub — owned by B8

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Epic' };

export default function Page() {
  return (
    <ComingSoon
      title="Epic"
      description="Issues, milestones and updates for this epic."
    />
  );
}
