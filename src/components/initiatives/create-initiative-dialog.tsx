'use client';

import { useId, useState, useTransition, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { createInitiative } from '@/app/actions/initiatives';
import { DatePicker, MemberPicker } from '@/components/epics/epic-pickers';
import { EPIC_DESCRIPTION_MAX } from '@/components/epics/epic-model';
import { RichTextEditor } from '@/components/epics/rich-text';
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
import { Avatar } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import type { IssueUser } from '@/lib/issue-model';
import { InitiativeStatusIcon, InitiativeStatusPicker } from './initiative-glyphs';
import {
  INITIATIVE_NAME_MAX,
  INITIATIVE_STATUS_LABEL,
  initiativesPath,
  type InitiativeStatus,
} from './initiative-model';

function Chip(props: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="max-w-48 font-normal text-muted-foreground aria-expanded:text-foreground"
      {...props}
    />
  );
}

export function CreateInitiativeDialog({
  open,
  onOpenChange,
  workspaceId,
  slug,
  members,
  viewerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  slug: string;
  members: IssueUser[];
  viewerId: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<InitiativeStatus>('planned');
  const [ownerId, setOwnerId] = useState<string | null>(viewerId);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = members.find((m) => m.id === ownerId);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const result = await createInitiative({
        workspaceId,
        name,
        description,
        status,
        ownerId,
        targetDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Created initiative “${name.trim()}”`);
      setName('');
      setDescription('');
      setStatus('planned');
      setTargetDate(null);
      setError(null);
      onOpenChange(false);
      if (result.id) router.push(initiativesPath(slug, result.id));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New initiative</DialogTitle>
          <DialogDescription>A goal that groups epics across this workspace’s projects.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-name`}>Name</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Initiative name"
              maxLength={INITIATIVE_NAME_MAX}
              autoFocus
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Description</span>
            <RichTextEditor
              aria-label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Why does this matter? Markdown supported."
              maxLength={EPIC_DESCRIPTION_MAX}
            />
          </div>
          <div role="group" aria-label="Properties" className="flex flex-wrap gap-1.5">
            <InitiativeStatusPicker value={status} onChange={setStatus}>
              <Chip aria-label={`Status: ${INITIATIVE_STATUS_LABEL[status]}`}>
                <InitiativeStatusIcon status={status} />
                <span className="text-foreground">{INITIATIVE_STATUS_LABEL[status]}</span>
              </Chip>
            </InitiativeStatusPicker>
            <MemberPicker
              value={ownerId}
              members={members}
              viewerId={viewerId}
              onChange={setOwnerId}
              placeholder="Set owner…"
              noneLabel="No owner"
            >
              <Chip aria-label={`Owner: ${owner?.name ?? 'none'}`}>
                {owner ? (
                  <>
                    <Avatar name={owner.name} src={owner.image} size={20} className="-my-1 size-4" />
                    <span className="truncate text-foreground">{owner.name}</span>
                  </>
                ) : (
                  <>
                    <UserRound />
                    Owner
                  </>
                )}
              </Chip>
            </MemberPicker>
            <DatePicker value={targetDate} onChange={setTargetDate} clearLabel="Clear target date">
              <Chip aria-label="Target date">
                <CalendarDays />
                {targetDate ? (
                  <span className="text-foreground">Target {formatDueDate(targetDate)}</span>
                ) : (
                  'Target date'
                )}
              </Chip>
            </DatePicker>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              Create initiative
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
