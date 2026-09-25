// Stub — owned by D6
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Customer' };

export default function Page() {
  return <ComingSoon title="Customer" />;
}
