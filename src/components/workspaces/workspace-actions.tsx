'use client';

// Workspace header "…" menu: rename (admin), leave (non-owner), delete (owner,
// confirm by typing the name). Leave and delete redirect server-side.

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, LogOut, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { deleteWorkspace, leaveWorkspace, renameWorkspace } from '@/app/actions/workspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkspaceRole } from './workspace-types';

type DialogKind = 'rename' | 'leave' | 'delete' | null;

export function WorkspaceActions({
  workspace,
  role,
}: {
  workspace: { id: string; name: string };
  role: WorkspaceRole;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = role !== 'member';

  function open(kind: DialogKind) {
    setValue(kind === 'rename' ? workspace.name : '');
    setError(null);
    setDialog(kind);
  }

  function run() {
    startTransition(async () => {
      const result =
        dialog === 'rename'
          ? await renameWorkspace({ workspaceId: workspace.id, name: value })
          : dialog === 'delete'
            ? await deleteWorkspace({ workspaceId: workspace.id, confirm: value })
            : await leaveWorkspace({ workspaceId: workspace.id });
      // Leave/delete redirect on success and never get here.
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success('Workspace renamed');
      setDialog(null);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Workspace actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isAdmin && (
            <DropdownMenuItem onSelect={() => open('rename')}>
              <Pencil />
              Rename…
            </DropdownMenuItem>
          )}
          {role !== 'owner' && (
            <DropdownMenuItem onSelect={() => open('leave')}>
              <LogOut />
              Leave workspace…
            </DropdownMenuItem>
          )}
          {role === 'owner' && (
            <>
              {isAdmin && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onSelect={() => open('delete')}>
                <Trash2 />
                Delete workspace…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(next) => !next && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>
                {dialog === 'rename'
                  ? 'Rename workspace'
                  : dialog === 'delete'
                    ? `Delete ${workspace.name}?`
                    : `Leave ${workspace.name}?`}
              </DialogTitle>
              <DialogDescription>
                {dialog === 'rename'
                  ? 'The URL stays the same.'
                  : dialog === 'delete'
                    ? 'Its projects stay intact but leave the workspace. Initiatives are deleted. This can’t be undone.'
                    : 'You’ll lose access to the workspace and its initiatives. Your project memberships don’t change.'}
              </DialogDescription>
            </DialogHeader>

            {dialog !== 'leave' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workspace-dialog-input">
                  {dialog === 'delete' ? (
                    <>
                      Type <strong>{workspace.name}</strong> to confirm
                    </>
                  ) : (
                    'Name'
                  )}
                </Label>
                <Input
                  id="workspace-dialog-input"
                  autoFocus
                  value={value}
                  maxLength={60}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={dialog === 'rename' ? 'default' : 'destructive'}
                disabled={
                  isPending ||
                  (dialog === 'delete' && value.trim() !== workspace.name) ||
                  (dialog === 'rename' && !value.trim())
                }
              >
                {isPending && <Loader2 className="animate-spin" />}
                {dialog === 'rename' ? 'Save' : dialog === 'delete' ? 'Delete workspace' : 'Leave'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
