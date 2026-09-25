// "Add to Slack": starts the OAuth v2 bot install for the signed-in user.

import { startSlackOAuth } from '@/lib/slack/oauth';

export function GET() {
  return startSlackOAuth('install');
}
