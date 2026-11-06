// "Link my Slack account": Sign in with Slack (OpenID Connect) for the signed-in user.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../_lib/options';

import { startSlackOAuth } from '@/lib/slack/oauth';

export const GET: RequestHandler = () => startSlackOAuth('link');

export const OPTIONS = allowOptions('GET');
