// GET /api/uploads/[uploadId] — serve an editor image to members of its
// project. Uploads are sniffed raster images, but the headers still assume
// hostile bytes: nosniff, a sandbox CSP and never an SVG / HTML type inline.

import { isPreviewableImage } from '@/components/issue-hierarchy/attachment-utils';
import { getSession } from '@/lib/session';
import { getUploadFile } from '@/lib/uploads';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const { uploadId } = await params;
  const session = await getSession();
  if (!session?.user) return new Response('Not authenticated', { status: 401 });

  const file = await getUploadFile(session.user.id, uploadId);
  if (!file) return new Response('Not found', { status: 404 });

  const inline = isPreviewableImage(file.contentType);
  const ascii = file.filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const bytes = Buffer.from(file.dataBase64, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': inline ? file.contentType : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"`,
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      // Ids are unguessable and rows immutable.
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  });
}
