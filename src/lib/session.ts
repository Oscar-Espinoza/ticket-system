import { cache } from '@/lib/kit/request';
import { headers } from '@/lib/kit/request';

import { auth } from '@/lib/auth';

// Request-scoped memo: layout + page + nested server components share one lookup.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
