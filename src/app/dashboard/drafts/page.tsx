// Stub — owned by B10

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Drafts' };

export default function Page() {
  return (
    <ComingSoon
      title="Drafts"
      description="Issues you started writing but haven't created yet."
    />
  );
}
