export type GithubAccountProp =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'error' }
  | {
      status: 'connected';
      login: string;
      avatarUrl: string;
      scopes: string[];
      hasRequiredScopes: boolean;
    };

export interface GithubSettingsProps {
  projectId: string;
  canEdit: boolean;
  account: GithubAccountProp;
  /** GITHUB_CLIENT_ID/SECRET are set on the server; without them nothing can be connected. */
  oauthConfigured: boolean;
  linkError: string | null;
  repo: string | null;
  webhookRegistered: boolean;
  connectedByName: string | null;
  webhookUrl: string;
  webhookUnreachable: boolean;
  prOpenStateId: string | null;
  prMergeStateId: string | null;
}
