import { cache } from 'react';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

// Request-scoped memo: layout + page + nested server components share one lookup.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
