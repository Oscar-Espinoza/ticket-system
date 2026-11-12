// OAuth client URLs are attacker-chosen (anyone can register a client): the
// write rule (https only) and the render rule (http(s) links only, applied to
// the Settings → OAuth apps data). No database.
import { describe, expect, it } from 'vitest';

import { authorizedAppView, invalidClientUri, oauthAppView } from '@/lib/oauth-model';

const XSS = ['javascript:alert(document.domain)', 'data:text/html,<script>alert(1)</script>', 'JaVaScRiPt:alert(1)'];

describe('invalidClientUri', () => {
  it('accepts absent, empty and absolute https values', () => {
    expect(invalidClientUri({})).toBeNull();
    expect(invalidClientUri({ client_uri: '', logo_uri: null })).toBeNull();
    expect(invalidClientUri({ client_uri: 'https://claude.ai', policy_uri: 'https://example.com/privacy' })).toBeNull();
  });

  it('names the first field that is not an https URL', () => {
    for (const value of [...XSS, 'http://example.com', '/relative', 'https://user:pw@example.com']) {
      expect(invalidClientUri({ client_uri: 'https://ok.example', tos_uri: value }), value).toBe('tos_uri');
    }
  });
});

describe('Settings → OAuth apps data', () => {
  const row = { clientId: 'c', name: 'Evil', redirectUris: [], isPublic: true, createdAt: null };

  it('drops non-http(s) homepage and logo URLs of stored clients', () => {
    for (const uri of XSS) {
      const authorized = authorizedAppView({ ...row, id: 'consent', scopes: ['read'], grantedAt: null, uri, icon: uri });
      expect(authorized.uri, uri).toBeNull();
      expect(authorized.icon, uri).toBeNull();
      expect(oauthAppView({ ...row, uri, icon: uri }).uri, uri).toBeNull();
    }
  });

  it('keeps http(s) URLs', () => {
    const view = authorizedAppView({ ...row, id: 'consent', scopes: [], grantedAt: null, uri: 'https://claude.ai', icon: null });
    expect(view.uri).toBe('https://claude.ai/');
  });
});
