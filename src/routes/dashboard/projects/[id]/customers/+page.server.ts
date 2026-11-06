// Customers list.
// The project layout already authorized the viewer; getProjectCustomers is
// membership-gated in SQL too.

import { customerTiers, getProjectCustomers } from '@/lib/customers';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const customers = await getProjectCustomers(params.id, user.id);
  return { customers, tiers: customerTiers(customers) };
};
