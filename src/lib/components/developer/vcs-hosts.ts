// What differs between the self-managed code hosts (everything GitHub-less
// that developer settings can connect). The connect form and the section read
// this instead of branching on the provider name.

import { m } from '@/lib/i18n';
import { VCS_PROVIDER_LABEL } from '@/lib/vcs/providers';

export type VcsHostProvider = 'gitlab' | 'bitbucket';

export interface VcsHost {
  name: string;
  /** Brand colour class for the mark. */
  markColor: string;
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
    get description() {
      return m.settings_dev_gitlab_desc();
    },
    get repoLabel() {
      return m.settings_dev_gitlab_repo_label();
    },
    repoPlaceholder: 'group/project',
    baseUrlField: true,
    usernameField: false,
  },
  bitbucket: {
    name: VCS_PROVIDER_LABEL.bitbucket,
    markColor: 'text-[#2684ff]',
    get description() {
      return m.settings_dev_bitbucket_desc();
    },
    get repoLabel() {
      return m.settings_dev_bitbucket_repo_label();
    },
    repoPlaceholder: 'workspace/repository',
    baseUrlField: false,
    usernameField: true,
  },
};
