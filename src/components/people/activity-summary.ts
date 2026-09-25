// Short, project-independent phrasing of an activity row for the member
// profile feed ("moved to In Progress", "commented on"). The issue timeline
// (B1) has richer per-change lines, but it needs a single project's data;
// the profile mixes projects.

const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  description: 'description',
  stateId: 'status',
  priority: 'priority',
  assigneeId: 'assignee',
  labelIds: 'labels',
  estimate: 'estimate',
  dueDate: 'due date',
  parentId: 'parent',
  cycleId: 'cycle',
  epicId: 'epic',
  milestoneId: 'milestone',
};

const VERB: Record<string, string> = {
  'issue.created': 'created',
  'issue.archived': 'archived',
  'issue.unarchived': 'unarchived',
  'issue.deleted': 'moved to trash',
  'issue.restored': 'restored',
  'issue.purged': 'permanently deleted',
  'comment.created': 'commented on',
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
      return to ? `moved to ${to}` : 'changed the status of';
    }
    const fields = changes
      .map((change) => FIELD_LABEL[String(change.field)] ?? String(change.field))
      .slice(0, 3);
    return `changed ${fields.join(', ')} on`;
  }
  if (VERB[type]) return VERB[type];
  if (typeof data.summary === 'string' && data.summary) return data.summary;
  return 'updated';
}
