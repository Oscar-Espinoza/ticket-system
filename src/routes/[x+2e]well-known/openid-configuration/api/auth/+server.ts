// OIDC discovery at the path-insertion location for issuer `<origin>/api/auth`
// (some MCP clients try /.well-known/openid-configuration/<issuer path> before
// the issuer-relative /api/auth/.well-known/openid-configuration that Better
// Auth's catch-all serves). Same document as the catch-all.

import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';

import type { RequestHandler } from './$types';
import { allowOptions } from '../../../../api/_lib/options';

import { auth } from '@/lib/auth';

const metadata = oauthProviderOpenIdConfigMetadata(auth);

export const GET: RequestHandler = ({ request }) => metadata(request);

export const OPTIONS = allowOptions('GET');
