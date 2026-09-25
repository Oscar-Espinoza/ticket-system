// Client-safe attachment helpers, shared by the section UI, the server DAL
// (src/lib/attachments.ts) and the upload / download routes.

import type { IssueUser } from '@/lib/issue-model';

/** Per-file cap; bytes are stored base64 in Postgres (free tier). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TITLE_MAX = 255;
export const ATTACHMENT_URL_MAX = 2048;

export interface AttachmentView {
  id: string;
  kind: 'file' | 'link';
  title: string;
  /** External URL for links; null for uploaded files (use attachmentPath). */
  url: string | null;
  contentType: string | null;
  size: number | null;
  uploader: IssueUser | null;
  createdAt: Date;
}

/** Download / preview URL of an uploaded file. */
export function attachmentPath(id: string): string {
  return `/api/attachments/${encodeURIComponent(id)}`;
}

// Raster formats browsers render as <img> without running anything. SVG is
// deliberately absent: it can carry script.
const PREVIEWABLE_IMAGES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

export function isPreviewableImage(contentType: string | null): boolean {
  return contentType !== null && PREVIEWABLE_IMAGES.has(contentType);
}

/** Served with `Content-Disposition: inline`; everything else downloads. */
export function isInlineSafe(contentType: string | null): boolean {
  return isPreviewableImage(contentType) || contentType === 'application/pdf';
}

/** `type/subtype` in lower case without parameters; junk → octet-stream. */
export function normalizeContentType(raw: string | null | undefined): string {
  const type = (raw ?? '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)
    ? type
    : 'application/octet-stream';
}

/** A trimmed http(s) URL, or null. */
export function parseLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > ATTACHMENT_URL_MAX) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Default title for a link: host + path, without the trailing slash. */
export function linkTitle(url: string): string {
  const { host, pathname } = new URL(url);
  return `${host}${pathname === '/' ? '' : pathname}`.slice(0, ATTACHMENT_TITLE_MAX);
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`;
}
