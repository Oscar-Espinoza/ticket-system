// Git branch naming, Linear style: `<user>/<key>-<slugified-title>`.
// Client-safe (pure) — the header copies synchronously in the click handler.

export const BRANCH_NAME_MAX = 60;

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The branch prefix: GitHub login when known, else the first word of the name. */
export function branchPrefix(login: string | null | undefined, name: string | null | undefined) {
  if (login) return login.toLowerCase();
  return slugify(name?.trim().split(/\s+/)[0] ?? '') || 'user';
}

/** e.g. branchNameFor('oscar', 'APP-12', 'Fix login on Safari') → oscar/app-12-fix-login-on-safari */
export function branchNameFor(prefix: string, key: string, title: string): string {
  const base = `${prefix}/${key.toLowerCase()}`;
  let slug = slugify(title);
  const room = BRANCH_NAME_MAX - base.length - 1;
  if (slug.length > room) {
    slug = slug.slice(0, Math.max(room, 0));
    // Cut on a word boundary when that doesn't throw away most of the slug.
    const lastDash = slug.lastIndexOf('-');
    if (lastDash > room / 2) slug = slug.slice(0, lastDash);
    slug = slug.replace(/-+$/, '');
  }
  return slug ? `${base}-${slug}` : base;
}

// A conservative subset of `git check-ref-format`: what branchNameFor produces
// plus what people commonly type (dots, underscores, nested slashes).
const BRANCH_RE = /^(?![-./])(?!.*\/\/|.*\/$|.*\.\.|.*\.lock$|.*@\{)[A-Za-z0-9._\-/]+$/;

export function isValidBranchName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 100 && BRANCH_RE.test(name);
}
