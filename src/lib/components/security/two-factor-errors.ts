// Error copy shared by the two-factor settings dialogs.

export function errorMessage(error: { status?: number; code?: string; message?: string } | null) {
  if (error?.code === 'INVALID_PASSWORD') return 'That password isn’t right.';
  if (error?.status === 429) return 'Too many attempts — wait a few seconds and try again.';
  return error?.message || 'Something went wrong. Try again.';
}
