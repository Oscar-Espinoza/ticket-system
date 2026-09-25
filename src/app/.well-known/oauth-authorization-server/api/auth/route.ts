// RFC 8414 authorization-server metadata for our OAuth provider (D10a). The
// issuer is `<origin>/api/auth`, so discovery lives at this path-suffixed URL,
// outside Better Auth's catch-all. (OIDC discovery is served by the catch-all
// at /api/auth/.well-known/openid-configuration.)

import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';

import { auth } from '@/lib/auth';

export const GET = oauthProviderAuthServerMetadata(auth);
