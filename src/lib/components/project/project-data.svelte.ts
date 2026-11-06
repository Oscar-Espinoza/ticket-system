// Per-project data (states, labels, members, cycles, epics, viewer) loaded once
// by the project layout and read anywhere below it with useProjectData().
//
// API:
//   setProjectDataContext(() => data)     provider; call during component init with a
//                                         GETTER (layout data changes on refreshAll and
//                                         when the [id] param changes without a remount).
//   <ProjectDataProvider value={data}>    same, as a component (project-data-provider.svelte)
//   useProjectData(): ProjectData         throws outside a provider
//   useOptionalProjectData(): ProjectData | null
//   useProjectPermission(level): { readonly current: boolean }
//
// The object useProjectData() returns is a live view: `data.states`,
// `data.project.role`, … always read the latest layout data, in markup,
// $derived and $effect. Read fields off it — destructuring
// (`const { states } = useProjectData()`) takes a one-time snapshot.

import { createContext } from 'svelte';

import type { ProjectData } from '@/lib/project-data-types';
import { roleAllows, type AccessLevel } from '@/lib/roles';

export type * from '@/lib/project-data-types';

/** A ProjectData whose fields forward to the provider's getter (stays reactive). */
class ProjectDataView implements ProjectData {
  #get: () => ProjectData;
  constructor(get: () => ProjectData) {
    this.#get = get;
  }
  get project() {
    return this.#get().project;
  }
  get states() {
    return this.#get().states;
  }
  get labels() {
    return this.#get().labels;
  }
  get members() {
    return this.#get().members;
  }
  get cycles() {
    return this.#get().cycles;
  }
  get epics() {
    return this.#get().epics;
  }
  get viewer() {
    return this.#get().viewer;
  }
  /** Plain copy of the current data (for structuredClone, JSON, server calls). */
  snapshot(): ProjectData {
    const { project, states, labels, members, cycles, epics, viewer } = this.#get();
    return { project, states, labels, members, cycles, epics, viewer };
  }
  toJSON(): ProjectData {
    return this.snapshot();
  }
}

const [getContext, setContext, hasContext] = createContext<ProjectDataView>();

/** Provide project data to every descendant. `value` is a getter (keeps it reactive). */
export function setProjectDataContext(value: () => ProjectData): ProjectData {
  return setContext(new ProjectDataView(value));
}

/** Throws outside a project route — use useOptionalProjectData there. */
export function useProjectData(): ProjectData {
  if (!hasContext()) throw new Error('useProjectData must be used inside <ProjectDataProvider>');
  return getContext();
}

/** null outside a project route (global palette, dashboard pages). */
export function useOptionalProjectData(): ProjectData | null {
  return hasContext() ? getContext() : null;
}

/** Whether the viewer's role allows `level` in this project (UI gating only). Reactive. */
export function useProjectPermission(level: AccessLevel): { readonly current: boolean } {
  const data = useProjectData();
  return {
    get current() {
      return roleAllows(data.project.role, level);
    },
  };
}
