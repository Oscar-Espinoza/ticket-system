// Server-sent live updates (no websockets on Vercel Hobby). A short-lived SSE
// stream: re-check the project's change token every ~1.5 s, emit `token` when
// it moves, a `: ping` comment every 15 s so proxies keep the connection, and
// `end` after ~50 s (under maxDuration) — LiveUpdates reconnects right away and
// falls back to polling `../changes` when streaming doesn't work.

import { getSession } from '@/lib/session';
import { getChangeToken } from '@/lib/sync/change-token';

export const maxDuration = 60;

const CHECK_MS = 1_500;
const HEARTBEAT_MS = 15_000;
const STREAM_MS = 50_000;
const NO_STORE = { 'Cache-Control': 'no-store' };

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([ctx.params, getSession()]);
  if (!session?.user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });
  const userId = session.user.id;

  const first = await getChangeToken(id, userId);
  // Non-members get the same 404 as a missing project (no id probing).
  if (first === null) return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

  const encoder = new TextEncoder();
  // Aborted by the client disconnecting or the stream being cancelled.
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          abort.abort();
        }
      };
      const event = (name: string, data: unknown) => send(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

      send('retry: 2000\n\n');
      event('token', { token: first });
      let last = first;
      const started = Date.now();
      let lastSent = started;
      let sayEnd = true;

      while (!abort.signal.aborted && Date.now() - started < STREAM_MS) {
        await sleep(CHECK_MS, abort.signal);
        if (abort.signal.aborted) break;
        let token: string | null;
        try {
          token = await getChangeToken(id, userId);
        } catch {
          // A DB blip: end this stream; the client reconnects (or polls).
          break;
        }
        if (token === null) {
          // Removed from the project mid-stream.
          event('gone', {});
          sayEnd = false;
          break;
        }
        if (token !== last) {
          last = token;
          lastSent = Date.now();
          event('token', { token });
        } else if (Date.now() - lastSent >= HEARTBEAT_MS) {
          lastSent = Date.now();
          send(': ping\n\n');
        }
      }

      if (!abort.signal.aborted) {
        if (sayEnd) event('end', {});
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Stop reverse proxies from buffering the stream.
      'X-Accel-Buffering': 'no',
    },
  });
}
