// Route table shared by the sidebar, project tabs, breadcrumb and palette, so a
// page added here shows up (and is labelled the same) everywhere at once.

import { m } from '@/lib/i18n';

export const projectHref = (projectId: string, section = '') =>
  `/dashboard/projects/${projectId}${section ? `/${section}` : ''}`;

/** Top-level pages (sidebar order). */
export const TOP_LEVEL_PAGES = [
  { segment: 'search', get label() { return m.common_search(); } },
  { segment: 'inbox', get label() { return m.common_inbox(); } },
  { segment: 'my-issues', get label() { return m.editor_nav_my_issues(); } },
  { segment: 'views', get label() { return m.editor_nav_views(); } },
  { segment: 'drafts', get label() { return m.editor_nav_drafts(); } },
  { segment: 'dashboards', get label() { return m.editor_nav_dashboards(); } },
  { segment: 'templates', get label() { return m.editor_nav_project_templates(); } },
] as const;

/** Project sub-pages. `''` is the issues page at the project root. */
export const PROJECT_SECTIONS: { segment: string; label: string }[] = [
  { segment: '', get label() { return m.editor_nav_issues(); } },
  { segment: 'triage', get label() { return m.editor_nav_triage(); } },
  { segment: 'cycles', get label() { return m.editor_nav_cycles(); } },
  { segment: 'epics', get label() { return m.editor_nav_epics(); } },
  { segment: 'roadmap', get label() { return m.editor_nav_roadmap(); } },
  { segment: 'views', get label() { return m.editor_nav_views(); } },
  { segment: 'docs', get label() { return m.editor_nav_docs(); } },
  { segment: 'customers', get label() { return m.editor_nav_customers(); } },
  { segment: 'insights', get label() { return m.editor_nav_insights(); } },
  { segment: 'archive', get label() { return m.editor_nav_archive(); } },
  { segment: 'trash', get label() { return m.editor_nav_trash(); } },
  { segment: 'members', get label() { return m.common_members(); } },
  { segment: 'settings', get label() { return m.common_settings(); } },
];

export const ACCOUNT_SETTINGS_NAV = [
  { segment: 'profile', get label() { return m.editor_nav_profile(); } },
  { segment: 'appearance', get label() { return m.editor_nav_appearance(); } },
  { segment: 'notifications', get label() { return m.editor_nav_notifications(); } },
  { segment: 'security', get label() { return m.editor_nav_security(); } },
  { segment: 'api-keys', get label() { return m.editor_nav_api_keys(); } },
  { segment: 'oauth-apps', get label() { return m.editor_nav_oauth_apps(); } },
  { segment: 'slack', get label() { return 'Slack'; } },
] as const;

export const PROJECT_SETTINGS_NAV = [
  { segment: 'general', get label() { return m.editor_nav_general(); } },
  { segment: 'members', get label() { return m.common_members(); } },
  { segment: 'workflow', get label() { return m.editor_nav_workflow(); } },
  { segment: 'labels', get label() { return m.common_labels(); } },
  { segment: 'templates', get label() { return m.editor_nav_templates(); } },
  { segment: 'planning', get label() { return m.editor_nav_planning(); } },
  { segment: 'automations', get label() { return m.editor_nav_automations(); } },
  { segment: 'sla', get label() { return m.editor_nav_sla(); } },
  { segment: 'recurring', get label() { return m.editor_nav_recurring(); } },
  { segment: 'github', get label() { return 'GitHub'; } },
  { segment: 'developer', get label() { return m.editor_nav_developer(); } },
  { segment: 'integrations', get label() { return m.editor_nav_integrations(); } },
  { segment: 'intake', get label() { return m.editor_nav_intake(); } },
  { segment: 'import-export', get label() { return m.editor_nav_import_export(); } },
  { segment: 'audit', get label() { return m.editor_nav_audit_log(); } },
] as const;

export function labelFor(
  list: readonly { segment: string; label: string }[],
  segment: string | undefined,
) {
  return list.find((item) => item.segment === (segment ?? ''))?.label;
}
