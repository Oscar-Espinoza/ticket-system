// Customers list (D6; port of src/app/dashboard/projects/[id]/customers/page.tsx).
// The project layout already authorized the viewer; getProjectCustomers is
// membership-gated in SQL too.

import { redirect } from '@sveltejs/kit';

import { customerTiers, getProjectCustomers } from '@/lib/customers';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const customers = await getProjectCustomers(params.id, session.user.id);
  return { customers, tiers: customerTiers(customers) };
};
