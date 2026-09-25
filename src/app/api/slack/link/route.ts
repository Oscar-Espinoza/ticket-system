// "Link my Slack account": Sign in with Slack (OpenID Connect) for the signed-in user.

import { startSlackOAuth } from '@/lib/slack/oauth';

export function GET() {
  return startSlackOAuth('link');
}
