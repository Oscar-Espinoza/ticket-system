// "Add to Slack": starts the OAuth v2 bot install for the signed-in user.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../_lib/options';

import { startSlackOAuth } from '@/lib/slack/oauth';

export const GET: RequestHandler = () => startSlackOAuth('install');

export const OPTIONS = allowOptions('GET');
