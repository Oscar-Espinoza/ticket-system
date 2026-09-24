'use client';

// MemberList — client component rendering the project member roster.
//
// Renders each member as a dense row with name + role chip. When isOwner is true
// and the row is neither the current user nor an owner row, a Remove button
// (AlertDialog confirm) is shown. Clicking Remove calls removeMember via
// startTransition and disables the button while pending.
//
// Props:
//   members       — array of { id, userId, name, role } from the members page
//   isOwner       — whether the viewing user is the project owner (controls visibility)
//   currentUserId — the session user id (hides Remove from self)
//   projectId     — forwarded to removeMember
//
// D-33: self-remove and owner-row removal are also rejected server-side.
// D-34: AlertDialog semantics match a destructive irreversible action (role="alertdialog").

import { useTransition } from 'react';
import { toast } from 'sonner';
import { UserMinus } from 'lucide-react';
import { LabelChip } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { removeMember } from '@/app/actions/members';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Member = {
  id: string;       // project_member row id — used as the FormData memberId
  userId: string;   // user id — compared to currentUserId to hide self-remove
  name: string;
  role: 'owner' | 'member';
};

type MemberListProps = {
  members: Member[];
  isOwner: boolean;
  currentUserId: string;
  projectId: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemberList({
  members,
  isOwner,
  currentUserId,
  projectId,
}: MemberListProps) {
  return (
    <div className="flex flex-col">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          isOwner={isOwner}
          currentUserId={currentUserId}
          projectId={projectId}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row — each row gets its own isPending + error state
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  isOwner,
  currentUserId,
  projectId,
}: {
  member: Member;
  isOwner: boolean;
  currentUserId: string;
  projectId: string;
}) {
  const [isPending, startTransition] = useTransition();

  // Show Remove control only when:
  //   1. Viewing user is owner
  //   2. Row is not an owner row (owner rows are unremovable)
  //   3. Row is not the current user's own row (self-remove blocked client-side too)
  const showRemove =
    isOwner && member.role !== 'owner' && member.userId !== currentUserId;

  function handleRemove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', member.id);
      const result = await removeMember({}, formData);
      if (result.errors?.server) {
        toast.error('Failed to remove member. Please try again.');
      } else {
        toast.success(`${member.name} was removed`);
      }
    });
  }

  return (
    <div className="flex h-10 items-center justify-between gap-4 rounded-md px-2 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{member.name}</span>
        {member.role === 'owner' ? (
          <LabelChip color="primary">Owner</LabelChip>
        ) : (
          <LabelChip>Member</LabelChip>
        )}
      </div>

      {showRemove && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              size="sm"
              disabled={isPending}
            >
              <UserMinus className="h-4 w-4" />
              Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove member?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{member.name}</strong> will immediately lose access to this
                project. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleRemove} disabled={isPending}>
                Remove member
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
