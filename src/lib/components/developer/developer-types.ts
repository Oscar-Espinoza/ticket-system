export interface VcsIntegrationView {
  repo: string;
  webUrl: string;
  /** GitLab only; shown when not gitlab.com. */
  baseUrl: string | null;
  webhookRegistered: boolean;
  connectedByName: string | null;
}

export interface SentryIntegrationView {
  webhookUrl: string;
  hasToken: boolean;
  connectedByName: string | null;
}

export interface DeveloperSettingsProps {
  projectId: string;
  canEdit: boolean;
  gitlab: VcsIntegrationView | null;
  bitbucket: VcsIntegrationView | null;
  sentry: SentryIntegrationView | null;
  /** The URL a Sentry connection uses (shown before connecting: Sentry needs it first). */
  sentryWebhookUrl: string;
  webhookBase: string;
  webhookUnreachable: boolean;
}
