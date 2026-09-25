// Channel stub — owned by D7 (Slack DMs to users who linked Slack; slack_user_link.notify).

import type { ChannelNotification } from './index';

export async function deliverSlackDm(_rows: ChannelNotification[]): Promise<void> {}
