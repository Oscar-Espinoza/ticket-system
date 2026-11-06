// Postgres error codes as thrown through drizzle (the driver error may sit
// anywhere in the `cause` chain).

export function hasPgCode(err: unknown, code: string): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === code) return true;
  }
  return false;
}

/** 23505: a unique constraint rejected the write (someone else got there first). */
export const isUniqueViolation = (err: unknown) => hasPgCode(err, '23505');
