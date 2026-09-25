// GET /api/attachments/[attachmentId] — serve an uploaded file to members of
// its issue's project. Only raster images and PDFs render inline; everything
// else (HTML, SVG, scripts, …) is a download, never sniffed, and sandboxed.

import { getAttachmentFile } from '@/lib/attachments';
import { getSession } from '@/lib/session';
import { isInlineSafe } from '@/components/issue-hierarchy/attachment-utils';

// Active-content types are served as opaque bytes even though they download.
const ACTIVE_CONTENT = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)$/;

function contentDisposition(kind: 'inline' | 'attachment', filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  // RFC 5987: encodeURIComponent leaves ' ( ) * unescaped, which attr-char forbids.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const session = await getSession();
  if (!session?.user) return new Response('Not authenticated', { status: 401 });

  const file = await getAttachmentFile(session.user.id, attachmentId);
  if (!file) return new Response('Not found', { status: 404 });

  const stored = file.contentType ?? 'application/octet-stream';
  const inline = isInlineSafe(stored);
  const headers = new Headers({
    'Content-Type': ACTIVE_CONTENT.test(stored) ? 'application/octet-stream' : stored,
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file.title),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  // Browsers' PDF viewers break under a sandbox CSP; PDFs don't need one.
  if (stored !== 'application/pdf') {
    headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  }

  const bytes = Buffer.from(file.dataBase64, 'base64');
  headers.set('Content-Length', String(bytes.byteLength));
  return new Response(bytes, { headers });
}
