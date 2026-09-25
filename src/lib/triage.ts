// Triage state resolution, shared by the triage UI and its server actions
// (client-safe: pure functions over a project's workflow states).

import type {
  IssueLabel,
  IssueRow,
  IssueUser,
  Priority,
  WorkflowState,
} from '@/lib/issue-model';
import { firstStateOfType, sortStates } from '@/lib/workflow';

/** States an accepted issue may move to (open, non-triage). */
export function acceptStates<T extends WorkflowState>(states: readonly T[]): T[] {
  return sortStates(states).filter(
    (s) => s.type === 'backlog' || s.type === 'unstarted' || s.type === 'started',
  );
}

/** Default accept target: first backlog state, else first unstarted one. */
export function defaultAcceptState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  return firstStateOfType(states, 'backlog') ?? firstStateOfType(states, 'unstarted');
}

function canceledStates<T extends WorkflowState>(states: readonly T[]): T[] {
  return sortStates(states).filter((s) => s.type === 'canceled');
}

const isDuplicateName = (s: WorkflowState) => s.name.trim().toLowerCase() === 'duplicate';

/** Where declined (and auto-closed) issues go: a canceled state that isn't "Duplicate". */
export function declineState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  const canceled = canceledStates(states);
  return (
    canceled.find((s) => s.name.trim().toLowerCase() === 'canceled') ??
    canceled.find((s) => !isDuplicateName(s)) ??
    canceled[0]
  );
}

/** Where duplicates go: the "Duplicate" canceled state, else any canceled one. */
export function duplicateState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  const canceled = canceledStates(states);
  return canceled.find(isDuplicateName) ?? canceled[0];
}

export const TRIAGE_REASON_MAX = 500;

// ---------------------------------------------------------------- suggestions
// Heuristic triage suggestions: the k most similar past issues vote on labels,
// assignee and priority, each vote weighted by its similarity score. Unlabeled /
// unassigned / no-priority neighbours abstain, which lowers the confidence.

export interface SuggestionSource {
  id: string;
  key: string;
  title: string;
}

interface Suggestion {
  /** Weighted share of the neighbours' votes (0–1). */
  confidence: number;
  basedOn: SuggestionSource[];
}

export interface LabelSuggestion extends Suggestion {
  label: IssueLabel;
}
export interface AssigneeSuggestion extends Suggestion {
  user: IssueUser;
}
export interface PrioritySuggestion extends Suggestion {
  priority: Priority;
}
export interface DuplicateSuggestion extends Suggestion {
  issue: SuggestionSource & { state: WorkflowState };
}

export interface TriageSuggestions {
  labels: LabelSuggestion[];
  assignee: AssigneeSuggestion | null;
  priority: PrioritySuggestion | null;
  duplicate: DuplicateSuggestion | null;
}

export interface TriageNeighbor {
  issue: IssueRow;
  score: number;
}

export const EMPTY_SUGGESTIONS: TriageSuggestions = {
  labels: [],
  assignee: null,
  priority: null,
  duplicate: null,
};

/** Minimum weighted share for a property suggestion. */
const MIN_CONFIDENCE = 0.4;
/** A single neighbour only counts on its own when it is this similar. */
const SOLO_SCORE = 0.6;
/** A likely duplicate must be at least this similar. */
const DUPLICATE_SCORE = 0.6;
const MAX_LABELS = 3;

const source = (issue: IssueRow): SuggestionSource => ({ id: issue.id, key: issue.key, title: issue.title });

/** Weighted vote: winners above the confidence bar, strongest first. */
function tally<T>(
  neighbors: TriageNeighbor[],
  votes: (issue: IssueRow) => { id: string; value: T }[],
): { value: T; confidence: number; basedOn: SuggestionSource[] }[] {
  const total = neighbors.reduce((sum, n) => sum + n.score, 0);
  if (total <= 0) return [];
  const byId = new Map<string, { value: T; weight: number; issues: TriageNeighbor[] }>();
  for (const neighbor of neighbors) {
    for (const { id, value } of votes(neighbor.issue)) {
      const entry = byId.get(id) ?? { value, weight: 0, issues: [] };
      entry.weight += neighbor.score;
      entry.issues.push(neighbor);
      byId.set(id, entry);
    }
  }
  return [...byId.values()]
    .filter((e) => e.weight / total >= MIN_CONFIDENCE)
    .filter((e) => e.issues.length >= 2 || e.issues[0].score >= SOLO_SCORE)
    .sort((a, b) => b.weight - a.weight)
    .map((e) => ({
      value: e.value,
      confidence: Math.round((e.weight / total) * 100) / 100,
      basedOn: [...e.issues].sort((a, b) => b.score - a.score).map((n) => source(n.issue)),
    }));
}

/**
 * Suggestions for a triage issue from its similar issues (best first).
 * `labels` / `members` are the project's current ones — anything else is dropped.
 * Suggestions the issue already satisfies are left out.
 */
export function suggestTriage(
  issue: IssueRow,
  similar: TriageNeighbor[],
  project: { labels: readonly IssueLabel[]; members: readonly IssueUser[] },
): TriageSuggestions {
  // Only curated issues vote: other triage issues haven't been handled yet.
  const neighbors = similar.filter((n) => n.issue.id !== issue.id && n.issue.state.type !== 'triage');
  const labelIds = new Set(project.labels.map((l) => l.id));
  const memberIds = new Set(project.members.map((m) => m.id));
  const current = new Set(issue.labels.map((l) => l.id));

  const labels = tally(neighbors, (i) =>
    i.labels.filter((l) => labelIds.has(l.id)).map((l) => ({ id: l.id, value: l })),
  )
    .filter((t) => !current.has(t.value.id))
    .slice(0, MAX_LABELS)
    .map(({ value, ...rest }) => ({
      label: project.labels.find((l) => l.id === value.id) ?? value,
      ...rest,
    }));

  const [assignee] = tally(neighbors, (i) =>
    i.assignee && memberIds.has(i.assignee.id) ? [{ id: i.assignee.id, value: i.assignee }] : [],
  );
  const [priority] = tally(neighbors, (i) =>
    i.priority !== 'none' ? [{ id: i.priority, value: i.priority }] : [],
  );

  const best = similar.find(
    (n) => n.issue.id !== issue.id && n.issue.state.type !== 'canceled' && n.score >= DUPLICATE_SCORE,
  );

  return {
    labels,
    assignee:
      assignee && assignee.value.id !== issue.assignee?.id
        ? {
            user: project.members.find((m) => m.id === assignee.value.id) ?? assignee.value,
            confidence: assignee.confidence,
            basedOn: assignee.basedOn,
          }
        : null,
    priority:
      priority && priority.value !== issue.priority
        ? { priority: priority.value, confidence: priority.confidence, basedOn: priority.basedOn }
        : null,
    duplicate: best
      ? {
          issue: { ...source(best.issue), state: best.issue.state },
          confidence: best.score,
          basedOn: [source(best.issue)],
        }
      : null,
  };
}
