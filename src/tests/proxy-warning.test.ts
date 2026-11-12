// The one-time "behind a proxy without ADDRESS_HEADER" warning. No database.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

describe('warnIfBehindUnconfiguredProxy', () => {
  it('warns once for a private address without ADDRESS_HEADER, never for a public one or when it is set', async () => {
    vi.resetModules();
    const { warnIfBehindUnconfiguredProxy } = await import('@/lib/server/proxy-warning');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(warnIfBehindUnconfiguredProxy('8.8.8.8', {})).toBe(false);
    expect(warnIfBehindUnconfiguredProxy('172.18.0.2', { ADDRESS_HEADER: 'X-Forwarded-For' })).toBe(false);
    expect(warnIfBehindUnconfiguredProxy('::ffff:127.0.0.1', {})).toBe(true);
    expect(warnIfBehindUnconfiguredProxy('172.18.0.2', {})).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('ADDRESS_HEADER=X-Forwarded-For and XFF_DEPTH');
  });
});
