// Customer detail (D6; port of src/app/dashboard/projects/[id]/customers/[customerId]/page.tsx).
// The project layout authorized the viewer; getCustomerDetail is
// membership-gated in SQL and scoped to this project, so a foreign or unknown
// customer id is a 404.

import { error, redirect } from '@sveltejs/kit';

import { getCustomerDetail, getCustomerTierOptions } from '@/lib/customers';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  // Tiers are only rendered once the membership-gated detail read succeeded.
  const [detail, tiers] = await Promise.all([
    getCustomerDetail(params.id, params.customerId, session.user.id),
    getCustomerTierOptions(params.id),
  ]);
  if (!detail) error(404, 'Customer not found');
  return { customer: detail.customer, requests: detail.requests, issues: detail.issues, tiers };
};
