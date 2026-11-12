// RFC 9728 protected-resource metadata for the MCP endpoint (src/lib/server/mcp/metadata.ts).

import { metadataOptions, protectedResourceResponse } from '@/lib/server/mcp/metadata';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => protectedResourceResponse();
export const OPTIONS: RequestHandler = () => metadataOptions();
