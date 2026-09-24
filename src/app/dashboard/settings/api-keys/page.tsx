// Stub — owned by B11

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'API keys' };

export default function Page() {
  return (
    <ComingSoon
      title="API keys"
      description="Personal API keys for the public API."
    />
  );
}
