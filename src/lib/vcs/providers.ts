// Code-host providers, pull request review / CI states and their display
// helpers. Client-safe (the issue pane and settings pages render these).

export const VCS_PROVIDERS = ['github', 'gitlab', 'bitbucket'] as const;
export type VcsProvider = (typeof VCS_PROVIDERS)[number];

export const VCS_PROVIDER_LABEL: Record<VcsProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

export function isVcsProvider(value: unknown): value is VcsProvider {
  return typeof value === 'string' && (VCS_PROVIDERS as readonly string[]).includes(value);
}

export type ReviewDecision = 'approved' | 'changes_requested' | 'review_required';
export type ChecksState = 'pending' | 'success' | 'failure';

export function isReviewDecision(value: unknown): value is ReviewDecision {
  return value === 'approved' || value === 'changes_requested' || value === 'review_required';
}

export function isChecksState(value: unknown): value is ChecksState {
  return value === 'pending' || value === 'success' || value === 'failure';
}

/** GitLab calls them merge requests and numbers them `!12`. */
export function prNoun(provider: VcsProvider): string {
  return provider === 'gitlab' ? 'MR' : 'PR';
}

export function prNumberLabel(provider: VcsProvider, number: number): string {
  return `${provider === 'gitlab' ? '!' : '#'}${number}`;
}

/** Worst state wins: any failure → failure, any pending → pending, else success. */
export function combineChecks(states: Iterable<ChecksState | null | undefined>): ChecksState | null {
  let result: ChecksState | null = null;
  for (const state of states) {
    if (state === 'failure') return 'failure';
    if (state === 'pending') result = 'pending';
    else if (state === 'success' && result === null) result = 'success';
  }
  return result;
}

/** Latest verdict per reviewer → one decision: any "changes" blocks, else any approval. */
export function combineReviews(
  verdicts: Iterable<'approved' | 'changes_requested' | null>,
  hasReviewers: boolean,
): ReviewDecision | null {
  let approved = false;
  for (const verdict of verdicts) {
    if (verdict === 'changes_requested') return 'changes_requested';
    if (verdict === 'approved') approved = true;
  }
  if (approved) return 'approved';
  return hasReviewers ? 'review_required' : null;
}

/** Branch URL on the provider's web UI (`repoUrl` = the repository page). */
export function branchUrl(provider: VcsProvider, repoUrl: string, branch: string): string {
  const path = branch.split('/').map(encodeURIComponent).join('/');
  const base = repoUrl.replace(/\/+$/, '');
  if (provider === 'gitlab') return `${base}/-/tree/${path}`;
  if (provider === 'bitbucket') return `${base}/branch/${path}`;
  return `${base}/tree/${path}`;
}
