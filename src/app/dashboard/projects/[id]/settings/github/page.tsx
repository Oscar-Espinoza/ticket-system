// Stub — owned by B3

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'GitHub' };

export default function Page() {
  return (
    <ComingSoon
      title="GitHub"
      description="Connect a repository, branch naming and pull request automation."
    />
  );
}
