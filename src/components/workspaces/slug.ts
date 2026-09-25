// Workspace URL slugs. Client-safe: the create dialog previews the slug with
// the same function the server action uses.

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 40;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= SLUG_MAX && SLUG_RE.test(slug);
}
