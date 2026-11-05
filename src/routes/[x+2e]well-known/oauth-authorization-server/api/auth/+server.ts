// RFC 8414 authorization-server metadata for our OAuth provider (D10a). The
// issuer is `<origin>/api/auth`, so discovery lives at this path-suffixed URL,
// outside Better Auth's catch-all. (OIDC discovery is served by the catch-all
// at /api/auth/.well-known/openid-configuration.)
//
// The directory is `[x+2e]well-known`: Kit's escape for a leading `.` in a route
// segment (so it serves /.well-known/…), which TypeScript can't resolve as-is.

import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';

import type { RequestHandler } from './$types';

import { auth } from '@/lib/auth';

const metadata = oauthProviderAuthServerMetadata(auth);

export const GET: RequestHandler = ({ request }) => metadata(request);
