// Stub — owned by B2

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return (
    <ComingSoon
      title="Inbox"
      description="Notifications about issues you follow, are assigned to or are mentioned in."
    />
  );
}
