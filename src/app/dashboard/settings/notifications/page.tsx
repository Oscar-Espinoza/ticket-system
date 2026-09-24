// Stub — owned by B2

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return (
    <ComingSoon
      title="Notifications"
      description="Choose which events notify you in the app and by email."
    />
  );
}
