// Short, project-independent phrasing of an activity row for the member
// profile feed ("moved to In Progress", "commented on"). The issue timeline
// has richer per-change lines, but it needs a single project's data;
// the profile mixes projects.

import { m } from '@/lib/i18n';

const FIELD_LABEL: Record<string, () => string> = {
  title: () => m.auth_activity_field_title(),
  description: () => m.auth_activity_field_description(),
  stateId: () => m.auth_activity_field_status(),
  priority: () => m.auth_activity_field_priority(),
  assigneeId: () => m.auth_activity_field_assignee(),
  labelIds: () => m.auth_activity_field_labels(),
  estimate: () => m.auth_activity_field_estimate(),
  dueDate: () => m.auth_activity_field_due_date(),
  waitingOnId: () => m.auth_activity_field_waiting_on(),
  followUp: () => m.auth_activity_field_follow_up(),
  parentId: () => m.auth_activity_field_parent(),
  cycleId: () => m.auth_activity_field_cycle(),
  epicId: () => m.auth_activity_field_epic(),
  milestoneId: () => m.auth_activity_field_milestone(),
};

const VERB: Record<string, () => string> = {
  'issue.created': () => m.auth_activity_created(),
  'issue.archived': () => m.auth_activity_archived(),
  'issue.unarchived': () => m.auth_activity_unarchived(),
  'issue.deleted': () => m.auth_activity_trashed(),
  'issue.restored': () => m.auth_activity_restored(),
  'issue.purged': () => m.auth_activity_purged(),
  'comment.created': () => m.auth_activity_commented(),
};

type Change = { field?: unknown; to?: unknown };

function nameOf(value: unknown): string | null {
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

export function activitySummary(type: string, data: Record<string, unknown>): string {
  if (type === 'issue.updated' && Array.isArray(data.changes) && data.changes.length > 0) {
    const changes = data.changes as Change[];
    if (changes.length === 1 && changes[0].field === 'stateId') {
      const to = nameOf(changes[0].to);
      return to ? m.auth_activity_moved_to({ state: to }) : m.auth_activity_changed_status();
    }
    const fields = changes
      .map((change) => FIELD_LABEL[String(change.field)]?.() ?? String(change.field))
      .slice(0, 3);
    return m.auth_activity_changed_fields({ fields: fields.join(', ') });
  }
  if (VERB[type]) return VERB[type]();
  if (typeof data.summary === 'string' && data.summary) return data.summary;
  return m.auth_activity_updated();
}
