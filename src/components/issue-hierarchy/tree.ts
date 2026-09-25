// Parent/child walks over a flat issue list (client-side mirror of the
// server's cycle check, used to keep impossible picks out of the pickers).

type Node = { id: string; parentId: string | null };

/** Ids of every issue below `id` (children, grandchildren, …). */
export function descendantIds(issues: readonly Node[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.parentId) continue;
    const list = children.get(issue.parentId);
    if (list) list.push(issue.id);
    else children.set(issue.parentId, [issue.id]);
  }
  const found = new Set<string>();
  const stack = [id];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (!found.has(child)) {
        found.add(child);
        stack.push(child);
      }
    }
  }
  return found;
}

/** Ids of every issue above `id` (parent, grandparent, …). */
export function ancestorIds(issues: readonly Node[], id: string): Set<string> {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const found = new Set<string>();
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId && !found.has(parentId)) {
    found.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return found;
}
