// Customer detail (D6). The project layout authorized the viewer;
// getCustomerDetail is membership-gated in SQL and scoped to this project, so a
// foreign or unknown customer id is a 404.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CustomerDetail } from '@/components/customers/customer-detail';
import { getCustomerDetail, getCustomerTierOptions } from '@/lib/customers';
import { getSession } from '@/lib/session';

type Params = Promise<{ id: string; customerId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ id, customerId }, session] = await Promise.all([params, getSession()]);
  const detail = session?.user ? await getCustomerDetail(id, customerId, session.user.id) : null;
  return { title: detail ? detail.customer.name : 'Customer not found' };
}

export default async function CustomerPage({ params }: { params: Params }) {
  const [{ id, customerId }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  // Tiers are only rendered once the membership-gated detail read succeeded.
  const [detail, tiers] = await Promise.all([
    getCustomerDetail(id, customerId, session.user.id),
    getCustomerTierOptions(id),
  ]);
  if (!detail) notFound();
  return (
    <CustomerDetail
      customer={detail.customer}
      requests={detail.requests}
      issues={detail.issues}
      tiers={tiers}
    />
  );
}
