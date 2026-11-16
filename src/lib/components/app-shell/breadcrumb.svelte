<!-- Topbar breadcrumb derived from the URL. -->
<script module lang="ts">
  import {
    ACCOUNT_SETTINGS_NAV,
    PROJECT_SECTIONS,
    PROJECT_SETTINGS_NAV,
    TOP_LEVEL_PAGES,
    labelFor,
    projectHref,
  } from '@/lib/components/app-shell/routes';

  export interface BreadcrumbProject {
    id: string;
    name: string;
  }

  interface Crumb {
    label: string;
    href?: string;
  }

  // Detail pages under these sections carry an opaque id in the URL; the crumb
  // shows a generic noun rather than fetching the record's name.
  const DETAIL_NOUN: Record<string, () => string> = {
    cycles: () => m.common_cycle(),
    epics: () => m.editor_noun_epic(),
    views: () => m.editor_nav_views(),
    initiatives: () => m.editor_noun_initiative(),
    docs: () => m.editor_noun_doc(),
    customers: () => m.editor_noun_customer(),
    dashboards: () => m.editor_noun_dashboard(),
  };

  // A malformed escape (e.g. a hand-typed "%") must not crash the whole shell.
  function decode(segment: string) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  function projectCrumbs(rest: string[], base: string): Crumb[] {
    const [section, detail, sub] = rest;
    if (!section) return [{ label: m.editor_nav_issues() }];
    // Issue permalink: the key itself (e.g. "APP-12") is the best label.
    if (section === 'issues' && detail) {
      return [{ label: m.editor_nav_issues(), href: base }, { label: decode(detail).toUpperCase() }];
    }
    const crumbs: Crumb[] = [
      { label: labelFor(PROJECT_SECTIONS, section) ?? section, href: `${base}/${section}` },
    ];
    if (section === 'settings' && detail) {
      crumbs.push({ label: labelFor(PROJECT_SETTINGS_NAV, detail) ?? detail });
    } else if (detail) {
      crumbs.push({ label: DETAIL_NOUN[section]?.() ?? detail });
    }
    if (sub) crumbs.push({ label: sub });
    return crumbs;
  }

  function crumbsFor(pathname: string, projects: BreadcrumbProject[]): Crumb[] {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] !== 'dashboard') return [];
    const [, area, id, ...rest] = segments;

    const crumbs: Crumb[] = [];

    if (!area) {
      crumbs.push({ label: m.editor_nav_projects() });
    } else if (area === 'projects' && id) {
      const project = projects.find((p) => p.id === id);
      const base = projectHref(id);
      crumbs.push({ label: project?.name ?? m.editor_nav_unknown_project(), href: base });
      crumbs.push(...projectCrumbs(rest, base));
    } else if (area === 'settings') {
      crumbs.push({ label: m.common_settings(), href: '/dashboard/settings' });
      if (id) crumbs.push({ label: labelFor(ACCOUNT_SETTINGS_NAV, id) ?? id });
    } else if (area === 'workspaces' && id) {
      crumbs.push({ label: decode(id), href: `/dashboard/workspaces/${id}` });
      if (rest[0] === 'initiatives') {
        crumbs.push({ label: m.editor_nav_initiatives(), href: `/dashboard/workspaces/${id}/initiatives` });
        if (rest[1]) crumbs.push({ label: DETAIL_NOUN.initiatives() });
      } else if (rest[0] === 'security' || rest[0] === 'audit') {
        crumbs.push({ label: rest[0] === 'security' ? m.editor_nav_security() : m.editor_nav_audit_log() });
      }
    } else if (area === 'people') {
      crumbs.push({ label: m.editor_nav_people() });
      if (id) crumbs.push({ label: m.editor_nav_profile() });
    } else {
      const label = labelFor(TOP_LEVEL_PAGES, area) ?? area;
      crumbs.push({ label, href: `/dashboard/${area}` });
      if (id) crumbs.push({ label: DETAIL_NOUN[area]?.() ?? id });
    }
    return crumbs;
  }
</script>

<script lang="ts">
  import { page } from '$app/state';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

  import { m } from '@/lib/i18n';
  import { cn } from '@/lib/utils';

  let { projects }: { projects: BreadcrumbProject[] } = $props();

  const crumbs = $derived(crumbsFor(page.url.pathname, projects));
</script>

{#if crumbs.length > 0}
  <nav aria-label={m.editor_nav_breadcrumb()} data-app-breadcrumb class="flex min-w-0 items-center gap-1.5 text-sm">
    {#each crumbs as crumb, i (i)}
      {@const last = i === crumbs.length - 1}
      {#if i > 0}
        <ChevronRightIcon aria-hidden="true" class="size-3 shrink-0 text-muted-foreground" />
      {/if}
      {#if crumb.href && !last}
        <a
          href={crumb.href}
          class="truncate rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {crumb.label}
        </a>
      {:else}
        <span
          aria-current={last ? 'page' : undefined}
          class={cn('truncate', last ? 'text-foreground' : 'text-muted-foreground')}
        >
          {crumb.label}
        </span>
      {/if}
    {/each}
  </nav>
{/if}
