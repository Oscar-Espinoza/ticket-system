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
  linkError: string | null;
  repo: string | null;
  webhookRegistered: boolean;
  connectedByName: string | null;
  webhookUrl: string;
  webhookUnreachable: boolean;
  prOpenStateId: string | null;
  prMergeStateId: string | null;
}
