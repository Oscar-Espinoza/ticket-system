// Stub — owned by D5
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Recurring issues' };

export default function Page() {
  return <ComingSoon title="Recurring issues" />;
}
