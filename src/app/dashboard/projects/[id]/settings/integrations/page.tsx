// Stub — owned by B11

import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Slack & webhooks' };

export default function Page() {
  return (
    <ComingSoon
      title="Slack & webhooks"
      description="Post issue events to Slack and outgoing webhooks."
    />
  );
}
