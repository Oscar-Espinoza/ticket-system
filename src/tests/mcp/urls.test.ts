// The MCP resource and its advertised authorization server come from one
// URL; a split configuration is refused with a message naming both. No database.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mcpAuthorizationServer, mcpConfig, mcpUrl } from '@/lib/server/mcp/urls';

afterEach(() => vi.unstubAllEnvs());

describe('mcpConfig', () => {
  it('is fine when the app URL and Better Auth URL agree', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://tickets.example.com/');
    vi.stubEnv('BETTER_AUTH_URL', 'https://tickets.example.com');
    expect(mcpConfig()).toEqual({ ok: true });
    expect(mcpUrl()).toBe('https://tickets.example.com/mcp');
    expect(mcpAuthorizationServer()).toBe('https://tickets.example.com/api/auth');
  });

  it('refuses and names both URLs when they differ', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('PUBLIC_APP_URL', 'https://tickets.example.com');
    vi.stubEnv('BETTER_AUTH_URL', 'https://auth.example.com');
    const config = mcpConfig();
    expect(config.ok).toBe(false);
    expect(!config.ok && config.error).toContain('https://tickets.example.com/api/auth');
    expect(!config.ok && config.error).toContain('https://auth.example.com/api/auth');
  });
});
