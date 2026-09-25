// project_integration rows for GitLab, Bitbucket and Sentry: typed config,
// lookups and the per-integration webhook URL. Server-only; tokens stay
// encrypted here and are decrypted only by the code that calls the provider.

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectIntegrations, projects } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';

export const INTEGRATION_PROVIDERS = ['gitlab', 'bitbucket', 'sentry'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(value: unknown): value is IntegrationProvider {
  return typeof value === 'string' && (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

export interface GitlabConfig {
  baseUrl: string;
  repo: string;
  remoteId: number;
  webUrl: string;
  defaultBranch: string | null;
  webhookId: string | null;
}

export interface BitbucketConfig {
  repo: string;
  webUrl: string;
  defaultBranch: string | null;
  webhookId: string | null;
  /** Set for API-token / app-password (Basic) auth; null = Bearer access token. */
  username: string | null;
}

export type SentryConfig = Record<string, never>;

export interface IntegrationRow<C = Record<string, unknown>> {
  id: string;
  projectId: string;
  provider: string;
  config: C;
  token: string | null;
  secret: string | null;
}

const columns = {
  id: projectIntegrations.id,
  projectId: projectIntegrations.projectId,
  provider: projectIntegrations.provider,
  config: projectIntegrations.config,
  token: projectIntegrations.token,
  secret: projectIntegrations.secret,
};

export async function getProjectIntegration<C>(
  projectId: string,
  provider: IntegrationProvider,
): Promise<IntegrationRow<C> | null> {
  const [row] = await db
    .select(columns)
    .from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, provider)))
    .limit(1);
  return (row as IntegrationRow<C> | undefined) ?? null;
}

/**
 * The integration a webhook URL names, with its project's automation settings.
 * Callers still verify the delivery's secret before trusting anything.
 */
export async function getWebhookIntegration<C>(integrationId: string, provider: IntegrationProvider) {
  if (!/^[0-9a-f-]{36}$/i.test(integrationId)) return null;
  const [row] = await db
    .select({
      ...columns,
      ticketKey: projects.ticketKey,
      prOpenStateId: projects.githubPrOpenStateId,
      prMergeStateId: projects.githubPrMergeStateId,
    })
    .from(projectIntegrations)
    .innerJoin(projects, eq(projects.id, projectIntegrations.projectId))
    .where(and(eq(projectIntegrations.id, integrationId), eq(projectIntegrations.provider, provider)))
    .limit(1);
  if (!row) return null;
  const { ticketKey, prOpenStateId, prMergeStateId, ...integration } = row;
  return {
    integration: integration as IntegrationRow<C>,
    project: { id: row.projectId, ticketKey, prOpenStateId, prMergeStateId },
  };
}

/**
 * Where a provider delivers. GITHUB_WEBHOOK_BASE_URL (a tunnel in local dev)
 * applies to every code host, like it does for GitHub.
 */
export function integrationWebhookUrl(provider: IntegrationProvider, integrationId: string): string {
  const base = (process.env.GITHUB_WEBHOOK_BASE_URL ?? appUrl()).replace(/\/+$/, '');
  return `${base}/api/webhooks/${provider}/${integrationId}`;
}

/**
 * The Sentry row's id, fixed per project: Sentry needs the webhook URL before
 * it issues the client secret, so the settings page shows this URL up front
 * and it survives reconnects. Knowing it grants nothing — deliveries must
 * carry a valid signature.
 */
export function sentryIntegrationId(projectId: string): string {
  const hex = createHash('sha256').update(`sentry-integration:${projectId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
