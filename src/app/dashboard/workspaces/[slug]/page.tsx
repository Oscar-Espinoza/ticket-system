// Stub — owned by B9

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Workspace' };

export default function Page() {
  return (
    <ComingSoon
      title="Workspace"
      description="Projects, members and initiatives in this workspace."
    />
  );
}
