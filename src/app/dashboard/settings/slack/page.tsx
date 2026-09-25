// Stub — owned by D7
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Slack' };

export default function Page() {
  return <ComingSoon title="Slack" />;
}
