// Stub — owned by B9

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Workflow' };

export default function Page() {
  return (
    <ComingSoon
      title="Workflow"
      description="Customize the workflow states issues move through."
    />
  );
}
