// Stub — owned by B7

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Automations' };

export default function Page() {
  return (
    <ComingSoon
      title="Automations"
      description="Auto-archive and auto-close rules."
    />
  );
}
