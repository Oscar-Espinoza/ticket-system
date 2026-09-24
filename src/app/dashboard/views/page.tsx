// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Views' };

export default function Page() {
  return (
    <ComingSoon
      title="Views"
      description="Saved filtered views across your projects."
    />
  );
}
