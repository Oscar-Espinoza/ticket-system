// Stub — owned by B9

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Labels' };

export default function Page() {
  return (
    <ComingSoon
      title="Labels"
      description="Create and organize issue labels."
    />
  );
}
