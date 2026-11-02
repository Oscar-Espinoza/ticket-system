import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkOutgoingUrl,
  isDeliverableUrl,
  isPrivateAddress,
  parseIPv6,
} from '@/lib/integrations/url-guard';

describe('parseIPv6', () => {
  it('expands compressed, mapped and zoned forms', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6('::ffff:7f00:1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6('0:0:0:0:0:ffff:a9fe:a9fe')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xa9fe, 0xa9fe]);
    expect(parseIPv6('1:2:3:4:5:6:1.2.3.4')).toEqual([1, 2, 3, 4, 5, 6, 0x102, 0x304]);
    expect(parseIPv6('fe80::1%eth0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('not-an-ip')).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it.each([
    // IPv4-mapped IPv6 in every spelling (review finding #2)
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a00:1',
    '::ffff:a9fe:a9fe',
    '0:0:0:0:0:ffff:7f00:0001',
    '0000:0000:0000:0000:0000:ffff:0a00:0001',
    '::FFFF:7F00:1',
    // IPv4-compatible, NAT64, 6to4 with private IPv4, Teredo
    '::7f00:1',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '2002:a00:1::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    // classic internal ranges
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    'example.com',
  ])('refuses %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '::ffff:808:808', '2606:4700:4700::1111', '2002:808:808::1'])(
    'allows public %s',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe('production URL checks', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:10.0.0.1]/',
    'https://[::ffff:169.254.169.254]/',
    'https://[::7f00:1]/',
    'https://[64:ff9b::a9fe:a9fe]/',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://0x7f.1/',
    'https://localhost/',
    'http://example.com/',
    'https://user:pw@example.com/',
  ])('rejects %s', async (url) => {
    expect(checkOutgoingUrl(url).ok).toBe(false);
    expect(await isDeliverableUrl(url)).toBe(false);
  });

  it('accepts a public IP literal', async () => {
    expect(checkOutgoingUrl('https://[2606:4700:4700::1111]/hook').ok).toBe(true);
    expect(await isDeliverableUrl('https://8.8.8.8/hook')).toBe(true);
  });
});
