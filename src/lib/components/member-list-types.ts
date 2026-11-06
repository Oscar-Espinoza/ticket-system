import type { ProjectRole } from '@/lib/roles';

export type MemberListMember = {
  /** project_member row id. */
  id: string;
  userId: string;
  name: string;
  email?: string | null;
  image?: string | null;
  role: ProjectRole;
};

export type MemberListProps = {
  members: MemberListMember[];
  currentUserId: string;
  projectId: string;
};
