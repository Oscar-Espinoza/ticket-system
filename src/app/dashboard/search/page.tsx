// Stub — owned by B6

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Search' };

export default function Page() {
  return (
    <ComingSoon
      title="Search"
      description="Full-text search across every issue you can see."
    />
  );
}
