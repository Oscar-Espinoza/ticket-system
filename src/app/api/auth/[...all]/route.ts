// Better Auth catch-all route handler — every auth endpoint (sign-up, sign-in,
// sign-out, session, OAuth callbacks) is served here.
//
// Runs on the default Node.js runtime (NO `runtime = 'edge'`): Better Auth's
// password hashing is not Edge-safe (RESEARCH Pitfall 4).

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
