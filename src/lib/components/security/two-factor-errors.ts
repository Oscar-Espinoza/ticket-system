import { m } from '@/lib/i18n';
// Error copy shared by the two-factor settings dialogs.

export function errorMessage(error: { status?: number; code?: string; message?: string } | null) {
  if (error?.code === 'INVALID_PASSWORD') return m.settings_sec_two_factor_wrong_password();
  if (error?.status === 429) return m.settings_sec_two_factor_rate_limited();
  return error?.message || m.common_error_generic();
}
