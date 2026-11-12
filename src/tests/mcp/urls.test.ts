// The MCP resource and its advertised authorization server come from one
// URL; a split configuration is refused with a generic message, and the two
// URLs go to the server log once. No database.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MCP_MISCONFIGURED, mcpAuthorizationServer, mcpConfig, mcpUrl } from '@/lib/server/mcp/urls';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('mcpConfig', () => {
  it('is fine when the app URL and Better Auth URL agree', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://tickets.example.com/');
    vi.stubEnv('BETTER_AUTH_URL', 'https://tickets.example.com');
    expect(mcpConfig()).toEqual({ ok: true });
    expect(mcpUrl()).toBe('https://tickets.example.com/mcp');
    expect(mcpAuthorizationServer()).toBe('https://tickets.example.com/api/auth');
  });

  it('treats letter case, the default port and a trailing slash as the same URL', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://Tickets.Example.com:443/');
    vi.stubEnv('BETTER_AUTH_URL', 'https://tickets.example.com');
    expect(mcpConfig()).toEqual({ ok: true });
  });

  it('refuses a split configuration without showing the URLs, and logs them once', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('PUBLIC_APP_URL', 'https://tickets.example.com');
    vi.stubEnv('BETTER_AUTH_URL', 'https://auth.internal.example');
    expect(mcpConfig()).toEqual({ ok: false, error: MCP_MISCONFIGURED });
    expect(mcpConfig()).toEqual({ ok: false, error: MCP_MISCONFIGURED });
    expect(MCP_MISCONFIGURED).not.toContain('example');
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('https://tickets.example.com/api/auth');
    expect(String(log.mock.calls[0][0])).toContain('https://auth.internal.example/api/auth');
  });
});
