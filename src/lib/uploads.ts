// Inline editor images outside an issue (epics, updates, docs, comments
// without an issue context). NO AUTHORIZATION on writes — callers authorize
// project access first. Reads are membership-gated in SQL. Bytes live base64
// in the `upload` row (free-tier Postgres, no blob store).

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, uploads } from '@/db/schema';
import {
  ATTACHMENT_TITLE_MAX,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  isPreviewableImage,
  normalizeContentType,
} from '@/components/issue-hierarchy/attachment-utils';

/** Served path of an upload. */
export function uploadPath(id: string): string {
  return `/api/uploads/${encodeURIComponent(id)}`;
}

// Magic numbers, so a renamed HTML/SVG file can't pose as a PNG.
const SIGNATURES: { type: string; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    type: 'image/webp',
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { type: 'image/avif', test: (b) => String.fromCharCode(...b.slice(4, 12)) === 'ftypavif' },
  { type: 'image/bmp', test: (b) => b[0] === 0x42 && b[1] === 0x4d },
];

export type UploadResult = { ok: true; id: string; url: string } | { ok: false; error: string };

export async function createUpload(
  actorId: string,
  projectId: string,
  input: { name: string; type: string; bytes: Uint8Array },
): Promise<UploadResult> {
  const size = input.bytes.byteLength;
  if (size === 0) return { ok: false, error: 'The file is empty.' };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `Images can be at most ${MAX_ATTACHMENT_LABEL}.` };

  const claimed = normalizeContentType(input.type);
  const sniffed = SIGNATURES.find((s) => s.test(input.bytes))?.type;
  // SVG and anything else that isn't a raster image are refused outright.
  if (!isPreviewableImage(claimed) || !sniffed) {
    return { ok: false, error: 'Only PNG, JPEG, GIF, WebP, AVIF or BMP images can be uploaded.' };
  }

  const id = crypto.randomUUID();
  await db.insert(uploads).values({
    id,
    projectId,
    uploaderId: actorId,
    filename: input.name.trim().slice(0, ATTACHMENT_TITLE_MAX) || 'image',
    contentType: sniffed,
    size,
    dataBase64: Buffer.from(input.bytes).toString('base64'),
    createdAt: new Date(),
  });
  return { ok: true, id, url: uploadPath(id) };
}

/** The upload with its bytes, only if `userId` is a member of its project (null otherwise). */
export async function getUploadFile(userId: string, uploadId: string) {
  const [row] = await db
    .select({
      filename: uploads.filename,
      contentType: uploads.contentType,
      dataBase64: uploads.dataBase64,
    })
    .from(uploads)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, uploads.projectId), eq(projectMembers.userId, userId)),
    )
    .where(eq(uploads.id, uploadId))
    .limit(1);
  return row ?? null;
}
