// Canonical issue URLs (the permalink page is B6's:
// src/app/dashboard/projects/[id]/issues/[key]/page.tsx).

export function issuePath(projectId: string, key: string): string {
  return `/dashboard/projects/${projectId}/issues/${encodeURIComponent(key)}`;
}

/** Absolute URL — browser only (uses window.location.origin). */
export function issueUrl(projectId: string, key: string): string {
  return `${window.location.origin}${issuePath(projectId, key)}`;
}
