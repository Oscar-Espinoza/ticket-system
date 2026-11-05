// Clipboard + "invitation sent" toasts shared by the workspace member rows and
// the invite dialog (module helpers of workspace-members.tsx).

import { toast } from 'svelte-sonner';

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — your browser blocked clipboard access');
  }
}

/** Toast after an invite / resend; offers the link when email is off. */
export function announceSent(email: string, result: { emailed?: boolean; url?: string }) {
  if (result.emailed || !result.url) {
    toast.success(`Invitation sent to ${email}`);
    return;
  }
  const url = result.url;
  toast.success('Invitation created', {
    description: 'Email isn’t configured on this server — share the link yourself.',
    action: { label: 'Copy link', onClick: () => void copyText(url, 'Invite link') },
  });
}
