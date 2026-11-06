export interface SlackWorkspace {
  teamId: string;
  teamName: string;
  installedByName: string | null;
  defaultProject: { id: string; name: string } | null;
  canManage: boolean;
  /** The viewer's own link to this workspace. */
  link: { notify: boolean } | null;
}

export interface SlackAdminProject {
  id: string;
  name: string;
  ticketKey: string;
}

export interface SlackAppUrls {
  redirect: string;
  commands: string;
  interactivity: string;
  events: string;
}
