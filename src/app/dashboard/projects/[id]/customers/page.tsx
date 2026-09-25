// Customers list (D6). The project layout already authorized the viewer;
// getProjectCustomers is membership-gated in SQL too.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CustomersList } from '@/components/customers/customers-list';
import { customerTiers, getProjectCustomers } from '@/lib/customers';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const customers = await getProjectCustomers(id, session.user.id);
  return <CustomersList customers={customers} tiers={customerTiers(customers)} />;
}
