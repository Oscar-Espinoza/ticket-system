'use client';

// MemberList — client component rendering the project member roster.
//
// Renders each member as a Card row with name + role Badge. When isOwner is true
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

import { useState, useTransition } from 'react';
import { UserMinus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <div className="flex flex-col gap-3">
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
  const [error, setError] = useState<string | null>(null);

  // Show Remove control only when:
  //   1. Viewing user is owner
  //   2. Row is not an owner row (owner rows are unremovable)
  //   3. Row is not the current user's own row (self-remove blocked client-side too)
  const showRemove =
    isOwner && member.role !== 'owner' && member.userId !== currentUserId;

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('memberId', member.id);
      const result = await removeMember({}, formData);
      if (result.errors?.server) {
        setError('Failed to remove member. Please try again.');
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: name + role badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{member.name}</span>
            {member.role === 'owner' ? (
              <Badge variant="secondary">Owner</Badge>
            ) : (
              <Badge variant="outline">Member</Badge>
            )}
          </div>

          {/* Right: Remove control (owner-only, non-self, non-owner rows) */}
          {showRemove && (
            <div className="flex flex-col items-end gap-1">
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
                      <strong>{member.name}</strong> will immediately lose
                      access to this project. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isPending}
                    >
                      Remove member
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Inline error — only rendered on action failure */}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
