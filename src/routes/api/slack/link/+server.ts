// "Link my Slack account": Sign in with Slack (OpenID Connect) for the signed-in user.

import type { RequestHandler } from './$types';

import { startSlackOAuth } from '@/lib/slack/oauth';

export const GET: RequestHandler = () => startSlackOAuth('link');
