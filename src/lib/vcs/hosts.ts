// The registry of token-based code hosts (GitLab, Bitbucket) that create and
// delete their webhook through one interface. GitHub's hook is managed with the
// acting user's Octokit (github/webhooks.ts). Server-only.

import {
  createBitbucketHook,
  deleteBitbucketHook,
  type BitbucketAuth,
} from '@/lib/vcs/bitbucket';
import { createGitlabHook, deleteGitlabHook } from '@/lib/vcs/gitlab';
import type { BitbucketConfig, GitlabConfig } from '@/lib/vcs/integrations';

export type HookHost = 'gitlab' | 'bitbucket';
export type HookConfig = GitlabConfig | BitbucketConfig;

interface HookAdapter {
  /** Registers `url` with `secret`; resolves to the host's hook id. */
  createHook(config: HookConfig, token: string, url: string, secret: string): Promise<string>;
  /** Best effort: true when the hook is gone (deleted now or already missing). */
  deleteHook(config: HookConfig, token: string, hookId: string): Promise<boolean>;
}

const bitbucketAuth = (config: BitbucketConfig, token: string): BitbucketAuth => ({
  token,
  username: config.username,
});

const HOOK_HOSTS: Record<HookHost, HookAdapter> = {
  gitlab: {
    createHook: (config, token, url, secret) => {
      const c = config as GitlabConfig;
      return createGitlabHook(c.baseUrl, token, c.remoteId, url, secret);
    },
    deleteHook: (config, token, hookId) => {
      const c = config as GitlabConfig;
      return deleteGitlabHook(c.baseUrl, token, c.remoteId, hookId);
    },
  },
  bitbucket: {
    createHook: (config, token, url, secret) => {
      const c = config as BitbucketConfig;
      return createBitbucketHook(bitbucketAuth(c, token), c.repo, url, secret);
    },
    deleteHook: (config, token, hookId) => {
      const c = config as BitbucketConfig;
      return deleteBitbucketHook(bitbucketAuth(c, token), c.repo, hookId);
    },
  },
};

export function hookHost(provider: HookHost): HookAdapter {
  return HOOK_HOSTS[provider];
}

export function isHookHost(value: unknown): value is HookHost {
  return typeof value === 'string' && Object.hasOwn(HOOK_HOSTS, value);
}
