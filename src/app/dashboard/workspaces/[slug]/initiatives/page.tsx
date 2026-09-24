// Stub — owned by B8

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Initiatives' };

export default function Page() {
  return (
    <ComingSoon
      title="Initiatives"
      description="Groups of epics that roll up to a company goal."
    />
  );
}
