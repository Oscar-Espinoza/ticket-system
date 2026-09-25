// Daily sweep so project automations (auto-archive, auto-close, trash purge,
// cycles) also run for projects nobody opened today. runProjectAutomations
// throttles itself to once a day per project, so this is safe to repeat.

import { asc, gt } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { runProjectAutomations } from '@/lib/automation';

const PAGE = 100;

export async function run(): Promise<string> {
  let after = '';
  let count = 0;
  for (;;) {
    const page = await db
      .select({ id: projects.id })
      .from(projects)
      .where(gt(projects.id, after))
      .orderBy(asc(projects.id))
      .limit(PAGE);
    for (const { id } of page) {
      await runProjectAutomations(id);
      count += 1;
    }
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  return `checked ${count} projects`;
}
