'use client';

// Per-project data (states, labels, members, cycles, epics, viewer) loaded once
// by the project layout and read anywhere below it with useProjectData().

import { createContext, use, type ReactNode } from 'react';

import type { ProjectData } from '@/lib/project-data-types';
import { roleAllows, type AccessLevel } from '@/lib/roles';

export type * from '@/lib/project-data-types';

const ProjectDataContext = createContext<ProjectData | null>(null);

export function ProjectDataProvider({
  value,
  children,
}: {
  value: ProjectData;
  children: ReactNode;
}) {
  return <ProjectDataContext value={value}>{children}</ProjectDataContext>;
}

/** Throws outside a project route — use useOptionalProjectData there. */
export function useProjectData(): ProjectData {
  const data = use(ProjectDataContext);
  if (!data) throw new Error('useProjectData must be used inside <ProjectDataProvider>');
  return data;
}

/** null outside a project route (global palette, dashboard pages). */
export function useOptionalProjectData(): ProjectData | null {
  return use(ProjectDataContext);
}

/** Whether the viewer's role allows `level` in this project (UI gating only). */
export function useProjectPermission(level: AccessLevel): boolean {
  return roleAllows(useProjectData().project.role, level);
}
