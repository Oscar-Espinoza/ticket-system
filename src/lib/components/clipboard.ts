import { toast } from 'svelte-sonner';
import { m } from '@/lib/i18n';

export async function copyToClipboard(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(m.issues_copied_what({ what }));
  } catch {
    toast.error(m.issues_copy_failed());
  }
}
