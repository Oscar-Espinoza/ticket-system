// Stub — owned by B12

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Import / export' };

export default function Page() {
  return (
    <ComingSoon
      title="Import / export"
      description="Import from CSV, Jira or GitHub Issues, and export to CSV."
    />
  );
}
