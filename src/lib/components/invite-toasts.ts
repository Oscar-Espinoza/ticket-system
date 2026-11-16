import { toast } from 'svelte-sonner';

import { m } from '@/lib/i18n';

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(m.auth_toast_copied_what({ what }));
  } catch {
    toast.error(m.auth_toast_copy_failed());
  }
}

/** Toast after an email invite / resend; offers the link when email is off. */
export function announceSent(email: string, result: { emailed?: boolean; url?: string }) {
  if (result.emailed || !result.url) {
    toast.success(m.auth_toast_invitation_sent({ email }));
    return;
  }
  const url = result.url;
  toast.success(m.auth_toast_invitation_created(), {
    description: m.auth_toast_email_not_configured(),
    action: { label: m.auth_copy_link(), onClick: () => void copyText(url, m.auth_invite_link_label()) },
  });
}
