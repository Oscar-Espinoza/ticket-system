// "Add to Slack": starts the OAuth v2 bot install for the signed-in user.

import type { RequestHandler } from './$types';

import { startSlackOAuth } from '@/lib/slack/oauth';

export const GET: RequestHandler = () => startSlackOAuth('install');
