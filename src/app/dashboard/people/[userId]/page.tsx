// Stub — owned by B9

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return (
    <ComingSoon
      title="Profile"
      description="Member profile, assigned issues and recent activity."
    />
  );
}
