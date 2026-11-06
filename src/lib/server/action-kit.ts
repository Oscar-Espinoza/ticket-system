// The result contract every server action shares with the forms that call it:
// `{ ok: true, …value }` or `{ ok: false, error, field? }`, where `error` is
// user-facing text except the two auth sentinels below (the UI maps
// 'Forbidden' with actionErrorText). Plus the input checks most actions need.

export type Fail<Field extends string = string> = { ok: false; error: string; field?: Field };

export type ActionResult<T = object, Field extends string = string> = ({ ok: true } & T) | Fail<Field>;

export const NOT_AUTHENTICATED = { ok: false, error: 'Not authenticated' } as const;
export const FORBIDDEN = { ok: false, error: 'Forbidden' } as const;

export function fail<Field extends string = string>(error: string, field?: Field): Fail<Field> {
  return field === undefined ? { ok: false, error } : { ok: false, error, field };
}

export const isFail = (value: unknown): value is Fail =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
