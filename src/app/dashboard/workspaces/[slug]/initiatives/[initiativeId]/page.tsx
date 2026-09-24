// Stub — owned by B8

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Initiative' };

export default function Page() {
  return (
    <ComingSoon
      title="Initiative"
      description="Epics, progress and health for this initiative."
    />
  );
}
