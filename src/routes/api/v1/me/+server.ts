import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { apiError } from '@/lib/api-auth';
import { apiRoute } from '../_lib/api';
import { allowOptions } from '../../_lib/options';

export const GET = apiRoute(async (_req, { userId }) => {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ? Response.json({ user }) : apiError(404, 'User not found.');
});

// Next answered OPTIONS automatically (204 + Allow); Kit would 405.
export const OPTIONS = allowOptions('GET');
