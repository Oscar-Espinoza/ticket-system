import { toast } from 'svelte-sonner';

import { m } from '@/lib/i18n';

/** Copies a customer's link and says so (the shared copyToClipboard toast is English-only). */
export async function copyCustomerLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(m.auth_customer_link_copied());
  } catch {
    toast.error(m.auth_customer_link_copy_failed());
  }
}
