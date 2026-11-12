import { describe, expect, it } from 'vitest';

import { githubOAuthConfigured } from '@/lib/github/oauth-config';

describe('githubOAuthConfigured', () => {
  it('is true only when both the client id and the secret are set', () => {
    expect(githubOAuthConfigured({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' })).toBe(true);
    expect(githubOAuthConfigured({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: '' })).toBe(false);
    expect(githubOAuthConfigured({ GITHUB_CLIENT_ID: '  ', GITHUB_CLIENT_SECRET: 'secret' })).toBe(false);
    expect(githubOAuthConfigured({})).toBe(false);
  });
});
