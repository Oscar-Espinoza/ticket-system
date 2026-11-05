// Navigation loading state for the dashboard (replaces Next's loading.tsx
// Suspense fallbacks). Read by the dashboard and project layouts.
//
//   const loading = useNavigationLoading();
//   loading.active      a navigation has been running for > DELAY_MS (progress bar)
//   loading.dashboard   show the dashboard skeleton (src/app/dashboard/loading.tsx)
//   loading.project     show the project issues skeleton (src/app/dashboard/projects/[id]/loading.tsx)
//
// Next keyed each loading.tsx Suspense boundary by the route segment directly
// below the layout that owns it, and ran navigations as transitions: a
// boundary that already shows content keeps the old UI while deeper segments
// load. So a skeleton shows only when that child segment changes:
//   dashboard   the segment after /dashboard ('' for the dashboard page itself,
//               'settings', 'projects', 'views', …; a dynamic one by its value).
//               /dashboard/projects/A -> /dashboard/projects/B shows nothing.
//   project     within the same project, the segment after /projects/[id]
//               ('', 'issues', 'settings', 'cycles', …). Issue permalink to
//               issue permalink, or settings tab to settings tab, shows nothing.
// Destinations that had their own loading.tsx elsewhere (inbox, cycles, triage,
// members, workflow, workspace, person) only get the progress bar. Same-path
// navigations (search params, e.g. the search box) keep the page.

import { navigating } from '$app/state';
import type { NavigationTarget } from '$app/navigation';

/** Delay before anything shows, so fast navigations never flash. */
export const DELAY_MS = 150;

const DASHBOARD = '/dashboard';
const PROJECT = '/dashboard/projects/[id]';

/** Routes that had their own loading.tsx (other lanes); no skeleton of ours for them. */
const OWN_LOADING = [
  '/dashboard/inbox',
  '/dashboard/people/[userId]',
  '/dashboard/workspaces/[slug]',
  '/dashboard/projects/[id]/cycles',
  '/dashboard/projects/[id]/triage',
  '/dashboard/projects/[id]/settings/members',
  '/dashboard/projects/[id]/settings/workflow',
];

const under = (routeId: string, prefix: string) => routeId === prefix || routeId.startsWith(`${prefix}/`);

const segments = (routeId: string) => routeId.split('/').filter(Boolean);

/** `[name]`, `[[name]]`, `[...name]`, `[name=matcher]` inside a route-id segment. */
const PARAM = /\[{1,2}(?:\.\.\.)?([^\]=]+)(?:=[^\]]+)?\]{1,2}/g;

/**
 * Key of the child segment right below `owner` (a route-id prefix the target is
 * under): the route-id segment, with dynamic parts replaced by their values;
 * '' when the target is the owner's own page.
 */
function childKey(target: NavigationTarget, owner: string): string {
  const segment = segments(target.route.id ?? '')[segments(owner).length];
  if (!segment) return '';
  const params: Record<string, string | undefined> = target.params ?? {};
  return segment.replace(PARAM, (_match, name: string) => `[${name}=${params[name] ?? ''}]`);
}

type Boundary = 'dashboard' | 'project' | null;

function boundaryFor(from: NavigationTarget | null, to: NavigationTarget | null): Boundary {
  const toId = to?.route.id;
  if (!to || !toId || !under(toId, DASHBOARD)) return null;
  if (from && from.url.pathname === to.url.pathname) return null;
  if (OWN_LOADING.some((prefix) => under(toId, prefix))) return null;
  const fromId = from?.route.id;
  // Same project: the project layout stays; only a new segment below it suspends.
  if (
    from &&
    fromId &&
    under(toId, PROJECT) &&
    under(fromId, PROJECT) &&
    from.params?.id === to.params?.id
  ) {
    return childKey(from, PROJECT) === childKey(to, PROJECT) ? null : 'project';
  }
  // The segment below the dashboard layout is unchanged: its boundary keeps the old page.
  if (from && fromId && under(fromId, DASHBOARD) && childKey(from, DASHBOARD) === childKey(to, DASHBOARD)) {
    return null;
  }
  return 'dashboard';
}

export function useNavigationLoading() {
  let delayed = $state(false);

  $effect(() => {
    if (!navigating.to) {
      delayed = false;
      return;
    }
    const timer = setTimeout(() => (delayed = true), DELAY_MS);
    return () => {
      clearTimeout(timer);
      delayed = false;
    };
  });

  const boundary = $derived(delayed ? boundaryFor(navigating.from, navigating.to) : null);

  return {
    get active() {
      return delayed && navigating.to !== null;
    },
    get dashboard() {
      return boundary === 'dashboard';
    },
    get project() {
      return boundary === 'project';
    },
  };
}
