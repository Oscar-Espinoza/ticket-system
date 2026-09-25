// Channel stub — owned by D11 (Web Push via VAPID; respects user_profile.pushNotifications).

import type { ChannelNotification } from './index';

export async function deliverPush(_rows: ChannelNotification[]): Promise<void> {}
