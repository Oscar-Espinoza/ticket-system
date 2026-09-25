// Stub — owned by D2
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Document' };

export default function Page() {
  return <ComingSoon title="Document" />;
}
