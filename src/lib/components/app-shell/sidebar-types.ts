export interface SidebarProject {
  id: string;
  name: string;
  ticketKey: string;
  /** Parent team (sub-teams); nested under it when the viewer has both. */
  parentId?: string | null;
}

export interface SidebarWorkspace {
  id: string;
  slug: string;
  name: string;
}
