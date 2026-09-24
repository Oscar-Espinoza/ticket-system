// Route table shared by the sidebar, project tabs, breadcrumb and palette, so a
// page added here shows up (and is labelled the same) everywhere at once.

export const projectHref = (projectId: string, section = '') =>
  `/dashboard/projects/${projectId}${section ? `/${section}` : ''}`;

/** Top-level pages (sidebar order). */
export const TOP_LEVEL_PAGES = [
  { segment: 'search', label: 'Search' },
  { segment: 'inbox', label: 'Inbox' },
  { segment: 'my-issues', label: 'My issues' },
  { segment: 'views', label: 'Views' },
  { segment: 'drafts', label: 'Drafts' },
] as const;

/** Project sub-pages. `''` is the issues page at the project root. */
export const PROJECT_SECTIONS: { segment: string; label: string }[] = [
  { segment: '', label: 'Issues' },
  { segment: 'triage', label: 'Triage' },
  { segment: 'cycles', label: 'Cycles' },
  { segment: 'epics', label: 'Epics' },
  { segment: 'roadmap', label: 'Roadmap' },
  { segment: 'views', label: 'Views' },
  { segment: 'insights', label: 'Insights' },
  { segment: 'archive', label: 'Archive' },
  { segment: 'trash', label: 'Trash' },
  { segment: 'members', label: 'Members' },
  { segment: 'settings', label: 'Settings' },
];

export const ACCOUNT_SETTINGS_NAV = [
  { segment: 'profile', label: 'Profile' },
  { segment: 'appearance', label: 'Appearance' },
  { segment: 'notifications', label: 'Notifications' },
  { segment: 'api-keys', label: 'API keys' },
] as const;

export const PROJECT_SETTINGS_NAV = [
  { segment: 'general', label: 'General' },
  { segment: 'members', label: 'Members' },
  { segment: 'workflow', label: 'Workflow' },
  { segment: 'labels', label: 'Labels' },
  { segment: 'templates', label: 'Templates' },
  { segment: 'planning', label: 'Cycles & triage' },
  { segment: 'automations', label: 'Automations' },
  { segment: 'github', label: 'GitHub' },
  { segment: 'integrations', label: 'Slack & webhooks' },
  { segment: 'intake', label: 'Intake form' },
  { segment: 'import-export', label: 'Import / export' },
] as const;

export function labelFor(
  list: readonly { segment: string; label: string }[],
  segment: string | undefined,
) {
  return list.find((item) => item.segment === (segment ?? ''))?.label;
}
