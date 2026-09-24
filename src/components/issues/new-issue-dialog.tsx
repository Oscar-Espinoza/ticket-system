'use client';

import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { createTicket } from '@/app/actions/tickets';
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

export function NewIssueDialog({
  projectId,
  open,
  onOpenChange,
  status = 'backlog',
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: TicketStatus;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  function reset() {
    setTitle('');
    setDescription('');
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createTicket({ projectId, title, description, status });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      onOpenChange(false);
      toast.success(result.ticket ? `Created ${result.ticket.key}` : 'Issue created');
    });
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
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
