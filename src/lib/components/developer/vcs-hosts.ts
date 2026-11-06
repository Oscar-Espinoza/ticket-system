// What differs between the self-managed code hosts (everything GitHub-less
// that developer settings can connect). The connect form and the section read
// this instead of branching on the provider name.

import { VCS_PROVIDER_LABEL } from '@/lib/vcs/providers';

export type VcsHostProvider = 'gitlab' | 'bitbucket';

export interface VcsHost {
  name: string;
  /** Brand colour class for the mark. */
  markColor: string;
  /** Plural noun for what the host calls its pull requests. */
  pr: string;
  description: string;
  repoLabel: string;
  repoPlaceholder: string;
  /** A "GitLab URL" field for self-hosted instances. */
  baseUrlField: boolean;
  /** An optional username field for API tokens / app passwords. */
  usernameField: boolean;
}

export const VCS_HOSTS: Record<VcsHostProvider, VcsHost> = {
  gitlab: {
    name: VCS_PROVIDER_LABEL.gitlab,
    markColor: 'text-[#e24329]',
    pr: 'merge requests',
    description:
      'Link a GitLab project (gitlab.com or self-hosted) so merge requests and commits update issues, with pipeline and approval status on each issue.',
    repoLabel: 'Project path',
    repoPlaceholder: 'group/project',
    baseUrlField: true,
    usernameField: false,
  },
  bitbucket: {
    name: VCS_PROVIDER_LABEL.bitbucket,
    markColor: 'text-[#2684ff]',
    pr: 'pull requests',
    description:
      'Link a Bitbucket Cloud repository so pull requests and commits update issues, with build and approval status on each issue.',
    repoLabel: 'Repository',
    repoPlaceholder: 'workspace/repository',
    baseUrlField: false,
    usernameField: true,
  },
};
