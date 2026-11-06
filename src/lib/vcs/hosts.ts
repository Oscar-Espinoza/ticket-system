// What every code host shares for webhooks: where deliveries go, whether that
// address is reachable, and the registry of token-based hosts (GitLab,
// Bitbucket) that create and delete their hook through one interface.
// GitHub's hook is managed with the acting user's Octokit (github/webhooks.ts)
// and only shares the URL rule and warning text. Server-only.

import { appUrl } from '@/lib/integrations/app-url';
import {
  createBitbucketHook,
  deleteBitbucketHook,
  type BitbucketAuth,
} from '@/lib/vcs/bitbucket';
import { createGitlabHook, deleteGitlabHook } from '@/lib/vcs/gitlab';
import type { BitbucketConfig, GitlabConfig } from '@/lib/vcs/integrations';
import { VCS_PROVIDER_LABEL, type VcsProvider } from '@/lib/vcs/providers';

/**
 * Origin hosts deliver webhooks to. GITHUB_WEBHOOK_BASE_URL points every host
 * at a tunnel in local dev while auth callbacks stay on the app URL.
 */
export function webhookBaseUrl(): string {
  return (process.env.GITHUB_WEBHOOK_BASE_URL ?? appUrl()).replace(/\/+$/, '');
}

/** Hosts can't deliver to loopback / private-network addresses. */
export function isUnreachableUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0'
  );
}

const REQUEST_NOUN: Record<VcsProvider, string> = {
  github: 'Pull request',
  gitlab: 'Merge request',
  bitbucket: 'Merge request',
};

/** The warning shown when a host can't reach `url`, so PR automation can't work. */
export function unreachableWebhookWarning(provider: VcsProvider, url: string): string {
  return `${VCS_PROVIDER_LABEL[provider]} can't reach ${url}. ${REQUEST_NOUN[provider]} automation needs a public URL — set PUBLIC_APP_URL (or GITHUB_WEBHOOK_BASE_URL for a tunnel) and register the webhook again.`;
}

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
