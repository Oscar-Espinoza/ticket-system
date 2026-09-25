// Repository webhook lifecycle + signature verification (GH-03 / GH-06).
// Server-only (node:crypto, Octokit with the acting user's token).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Octokit } from '@octokit/rest';

import { githubStatus, splitRepo } from '@/lib/github/client';

export const WEBHOOK_EVENTS = ['pull_request', 'push'];

/**
 * Where GitHub delivers. GITHUB_WEBHOOK_BASE_URL lets local dev point GitHub
 * at a tunnel while auth callbacks stay on NEXT_PUBLIC_APP_URL.
 */
export function webhookUrl(): string {
  const base =
    process.env.GITHUB_WEBHOOK_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';
  return `${base.replace(/\/+$/, '')}/api/webhooks/github`;
}

/** GitHub can't deliver to loopback / private-network hosts. */
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

export function newWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create the repo webhook. Store `secret` on the project BEFORE calling this:
 * GitHub sends a signed `ping` right away, possibly before we learn the hook id.
 * Throws GitHub errors.
 */
export async function createRepoWebhook(
  octokit: Octokit,
  fullName: string,
  secret: string,
): Promise<string> {
  const target = splitRepo(fullName);
  if (!target) throw new Error(`Invalid repository name: ${fullName}`);
  const { data } = await octokit.rest.repos.createWebhook({
    ...target,
    name: 'web',
    active: true,
    events: WEBHOOK_EVENTS,
    config: { url: webhookUrl(), content_type: 'json', secret, insecure_ssl: '0' },
  });
  return String(data.id);
}

/** Best effort: true when gone (deleted now or already missing). */
export async function deleteRepoWebhook(
  octokit: Octokit,
  fullName: string,
  hookId: string,
): Promise<boolean> {
  const target = splitRepo(fullName);
  const id = Number(hookId);
  if (!target || !Number.isInteger(id)) return true;
  try {
    await octokit.rest.repos.deleteWebhook({ ...target, hook_id: id });
    return true;
  } catch (err) {
    return githubStatus(err) === 404;
  }
}

/** Timing-safe check of `X-Hub-Signature-256` over the raw body. */
export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`,
  );
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
