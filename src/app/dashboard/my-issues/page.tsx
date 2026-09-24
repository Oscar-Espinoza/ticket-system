// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'My issues' };

export default function Page() {
  return (
    <ComingSoon
      title="My issues"
      description="Issues assigned to you, created by you and subscribed to, across projects."
    />
  );
}
