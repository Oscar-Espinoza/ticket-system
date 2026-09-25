// Stub — owned by D10b
import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'GitLab, Bitbucket & Sentry' };

export default function Page() {
  return <ComingSoon title="GitLab, Bitbucket & Sentry" />;
}
