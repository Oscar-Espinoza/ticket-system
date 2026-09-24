// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'View' };

export default function Page() {
  return (
    <ComingSoon
      title="View"
      description="A saved view of issues."
    />
  );
}
