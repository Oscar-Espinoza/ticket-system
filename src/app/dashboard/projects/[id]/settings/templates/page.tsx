// Stub — owned by B10

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Templates' };

export default function Page() {
  return (
    <ComingSoon
      title="Templates"
      description="Reusable templates for new issues."
    />
  );
}
