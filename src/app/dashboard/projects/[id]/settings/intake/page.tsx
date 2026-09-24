// Stub — owned by B11

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Intake form' };

export default function Page() {
  return (
    <ComingSoon
      title="Intake form"
      description="A public form that turns requests into triage issues."
    />
  );
}
