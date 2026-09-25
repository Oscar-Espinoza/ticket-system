// GraphQL API (graphql-yoga). Same credentials as REST v1: a personal API key
// or an OAuth access token as `Authorization: Bearer …`. GraphiQL is served on
// GET in development only; there the page itself loads without a token (set
// the header in GraphiQL's headers pane).

import { apiError, authenticateApiRequest } from '@/lib/api-auth';
import { yoga } from '@/lib/graphql/schema';

const MAX_BODY_BYTES = 100_000;

function wantsGraphiQL(req: Request): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    req.method === 'GET' &&
    !req.headers.has('authorization') &&
    (req.headers.get('accept') ?? '').includes('text/html')
  );
}

async function handle(req: Request): Promise<Response> {
  // CORS preflights carry no credentials; yoga answers them without executing.
  if (req.method === 'OPTIONS' || wantsGraphiQL(req)) {
    return yoga.handleRequest(req, { credential: null });
  }

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return apiError(413, 'Request body too large.');

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;
  const { userId, keyId, via, clientId, scopes } = auth;
  return yoga.handleRequest(req, { credential: { userId, keyId, via, clientId, scopes } });
}

export { handle as GET, handle as POST, handle as OPTIONS };
