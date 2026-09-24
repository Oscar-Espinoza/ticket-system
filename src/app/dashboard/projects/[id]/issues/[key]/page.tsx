// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Issue' };

export default function Page() {
  return (
    <ComingSoon
      title="Issue"
      description="The full page for a single issue."
    />
  );
}
