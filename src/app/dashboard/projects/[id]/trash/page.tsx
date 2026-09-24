// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Trash' };

export default function Page() {
  return (
    <ComingSoon
      title="Trash"
      description="Deleted issues. Restore them or delete them for good."
    />
  );
}
