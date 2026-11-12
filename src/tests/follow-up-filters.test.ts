// Client-side filters for waiting-on / follow-up: the matcher every issue view
// runs, URL / saved-view round trip, and query tokens turning into chips.
import { describe, expect, it } from 'vitest';

import {
  EMPTY_FILTERS,
  NONE,
  filterIssues,
  filtersFromSearchParams,
  filtersToSearchParams,
  resolveSearchTerms,
  searchFollowUp,
} from '@/lib/issue-filtering';
import { duplicateInput } from '@/lib/components/productivity/issue-actions';
import type { IssueRow } from '@/lib/issue-model';

const TODAY = '2026-11-12';
const state = (type: 'started' | 'completed') => ({ id: type, name: type, type, color: '#000', position: 0, description: null });
const issue = (key: string, waitingOn: string | null, followUp: string | null, type: 'started' | 'completed' = 'started') =>
  ({ id: key, key, title: key, waitingOn: waitingOn && { id: waitingOn, name: waitingOn, image: null }, followUp, state: state(type), stateId: type }) as unknown as IssueRow;

const issues = [
  issue('A', 'me-id', '2026-11-10'),
  issue('B', 'ana', TODAY),
  issue('C', null, null),
  issue('D', 'me-id', '2026-11-01', 'completed'),
];
const keys = (q: Partial<typeof EMPTY_FILTERS>) =>
  filterIssues(issues, q, { viewerId: 'me-id', today: TODAY }).map((i) => i.key);

describe('waiting-on / follow-up filters', () => {
  it('structured filters: waiting on me / no one, follow-up overdue (open only) / today', () => {
    expect(keys({ waitingOnIds: ['me'] })).toEqual(['A', 'D']);
    expect(keys({ waitingOnIds: [NONE] })).toEqual(['C']);
    expect(keys({ followUp: ['overdue'] })).toEqual(['A']);
    expect(keys({ followUp: ['today', 'none'] })).toEqual(['B', 'C']);
  });

  it('query tokens: waiting:, followup: words and date bounds, negation', () => {
    expect(keys({ q: 'waiting:me followup:overdue' })).toEqual(['A']);
    expect(keys({ q: 'waiting:ana' })).toEqual(['B']);
    expect(keys({ q: 'followup:<=2026-11-10' })).toEqual(['A', 'D']);
    expect(keys({ q: '-waiting:none followup:>2026-11-10' })).toEqual(['B']);
    expect(searchFollowUp('>2026-11-30')).toEqual({ from: '2026-12-01' });
    expect(searchFollowUp('soon')).toBeNull();
  });

  it('round-trips through URL params and turns simple tokens into chips', () => {
    const filters = { ...EMPTY_FILTERS, waitingOnIds: ['me', NONE], followUp: ['overdue' as const] };
    const params = new URLSearchParams(
      Object.entries(filtersToSearchParams(filters)).filter((e): e is [string, string] => e[1] !== null),
    );
    expect(params.get('waitingOn')).toBe('me,none');
    expect(filtersFromSearchParams(params)).toEqual(filters);

    const chips = resolveSearchTerms(EMPTY_FILTERS, 'waiting:me followup:today followup:<=2026-12-01 bug', {
      states: [],
      labels: [],
      members: [],
      cycles: [],
      epics: [],
    });
    expect(chips.waitingOnIds).toEqual(['me']);
    // Two followup terms: neither converts; bounds always stay as text.
    expect(chips.followUp).toEqual([]);
    expect(chips.q).toBe('followup:today followup:<=2026-12-01 bug');
  });
});

describe('duplicating an issue', () => {
  it('keeps waiting-on only while that person is still a project member', () => {
    const source = { ...issue('A', 'ana', '2026-11-20'), labels: [], assignee: null } as unknown as IssueRow;
    expect(duplicateInput(source, new Set(['ana']))).toMatchObject({ waitingOnId: 'ana', followUp: '2026-11-20' });
    expect(duplicateInput(source, new Set(['bob'])).waitingOnId).toBeNull();
  });
});
