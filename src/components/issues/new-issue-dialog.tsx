'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusIcon } from '@/components/ui-icons';
import { STATUS_LABEL, type TicketStatus } from '@/lib/issue-model';
import type { IssueMutations } from './use-issue-mutations';

// The dialog closes on submit and the issue appears optimistically; on failure
// it reopens with the draft (this component stays mounted, so state survives).
export function NewIssueDialog({
  open,
  onOpenChange,
  status = 'backlog',
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: TicketStatus;
  onCreate: IssueMutations['create'];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setError(null);
    onOpenChange(false);
    onCreate(
      { title, description, status },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
        },
        onError: (message) => {
          setError(message);
          onOpenChange(true);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <StatusIcon status={status} size={14} />
            {STATUS_LABEL[status]}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`}>Title</Label>
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              maxLength={200}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>Description</Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={5}
            />
          </div>
          {error && (
            <p id={`${uid}-error`} className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
