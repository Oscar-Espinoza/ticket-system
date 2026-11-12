// get_cycle: one cycle's progress, burndown and open issues.

import { z } from 'zod';

import { mcpProject } from '../access';
import { issueListMarkdown, toolError, toolResult } from '../format';
import { cycleStatus, loadProjectMetadata, resolveCycle } from '../resolve';
import { defineTool } from './common';
import { cycleText, overviewFor, projectArg } from './projects';

export const getCycle = defineTool({
  name: 'get_cycle',
  title: 'Get cycle',
  description:
    'Show a cycle (sprint) of a project: dates, scope, completed and in-progress counts, daily burndown and its open issues. Defaults to the current cycle.',
  scope: 'read',
  input: z.object({
    project: projectArg,
    cycle: z
      .string()
      .max(100)
      .optional()
      .describe('Cycle number ("4"), name, id, "current" (default) or "next".'),
  }),
  invoking: 'Reading the cycle…',
  invoked: 'Read the cycle',
  async run({ project: ref, cycle: cycleRef }, { userId }) {
    const access = await mcpProject(userId, ref, 'read');
    if (!access.ok) return toolError(access.error);
    const { project } = access;
    const meta = await loadProjectMetadata(project.id);
    const now = new Date();

    let cycleId: string | null;
    if (cycleRef) {
      const resolved = resolveCycle(meta, cycleRef, now);
      if (!resolved.ok) return toolError(resolved.error);
      cycleId = resolved.value;
    } else {
      // Current, else the next upcoming, else the latest past cycle.
      const pick =
        meta.cycles.find((c) => cycleStatus(c, now) === 'current') ??
        meta.cycles.find((c) => cycleStatus(c, now) === 'upcoming') ??
        meta.cycles.at(-1);
      cycleId = pick?.id ?? null;
    }
    const cycle = meta.cycles.find((c) => c.id === cycleId);
    if (!cycle) return toolError(`${project.name} has no cycles.`);

    const view = await overviewFor(project, cycle, 'cycle');
    const text = [
      `${project.name} (${project.key})`,
      cycleText(view.cycle!),
      '',
      issueListMarkdown('Open issues in this cycle', view.issues, null),
    ].join('\n');
    return toolResult(text, view);
  },
});
