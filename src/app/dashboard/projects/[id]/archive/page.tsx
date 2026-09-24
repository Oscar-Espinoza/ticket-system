// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Archive' };

export default function Page() {
  return (
    <ComingSoon
      title="Archive"
      description="Archived issues. Restore any of them to the workflow."
    />
  );
}
