'use client';

import { useId, useState, useTransition, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CalendarRange, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { createEpic } from '@/app/actions/epics';
import { useProjectData } from '@/components/project/project-data';
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
import { EpicStatusIcon } from './epic-glyphs';
import {
  DEFAULT_EPIC_COLOR,
  EPIC_DESCRIPTION_MAX,
  EPIC_NAME_MAX,
  EPIC_STATUS_LABEL,
  epicPath,
  type EpicStatus,
} from './epic-model';
import { ColorSwatches, DatePicker, EpicStatusPicker, MemberPicker } from './epic-pickers';
import { RichTextEditor } from './rich-text';

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

export function CreateEpicDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { project, members, viewer } = useProjectData();
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EpicStatus>('planned');
  const [leadId, setLeadId] = useState<string | null>(viewer.id);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [color, setColor] = useState(DEFAULT_EPIC_COLOR);
  const [error, setError] = useState<string | null>(null);
  const lead = members.find((m) => m.id === leadId);

  const reset = () => {
    setName('');
    setDescription('');
    setStatus('planned');
    setLeadId(viewer.id);
    setStartDate(null);
    setTargetDate(null);
    setColor(DEFAULT_EPIC_COLOR);
    setError(null);
  };

  function submit(event?: React.FormEvent, openAfter = false) {
    event?.preventDefault();
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const result = await createEpic({
        projectId: project.id,
        name,
        description,
        status,
        leadId,
        startDate,
        targetDate,
        color,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Created epic “${name.trim()}”`);
      reset();
      onOpenChange(false);
      if (openAfter && result.id) router.push(epicPath(project.id, result.id));
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New epic</DialogTitle>
          <DialogDescription>
            A larger piece of work made of many {project.ticketKey} issues.
          </DialogDescription>
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
              placeholder="Epic name"
              maxLength={EPIC_NAME_MAX}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Description</span>
            <RichTextEditor
              aria-label="Description"
              value={description}
              onChange={setDescription}
              placeholder="What is this epic about? Markdown supported."
              maxLength={EPIC_DESCRIPTION_MAX}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Color</span>
            <ColorSwatches value={color} onChange={setColor} />
          </div>

          <div role="group" aria-label="Properties" className="flex flex-wrap gap-1.5">
            <EpicStatusPicker value={status} onChange={setStatus}>
              <Chip aria-label={`Status: ${EPIC_STATUS_LABEL[status]}`}>
                <EpicStatusIcon status={status} />
                <span className="text-foreground">{EPIC_STATUS_LABEL[status]}</span>
              </Chip>
            </EpicStatusPicker>
            <MemberPicker
              value={leadId}
              members={members}
              viewerId={viewer.id}
              onChange={setLeadId}
            >
              <Chip aria-label={`Lead: ${lead?.name ?? 'none'}`}>
                {lead ? (
                  <>
                    <Avatar name={lead.name} src={lead.image} size={20} className="-my-1 size-4" />
                    <span className="truncate text-foreground">{lead.name}</span>
                  </>
                ) : (
                  <>
                    <UserRound />
                    Lead
                  </>
                )}
              </Chip>
            </MemberPicker>
            <DatePicker value={startDate} onChange={setStartDate} clearLabel="Clear start date">
              <Chip aria-label="Start date">
                <CalendarRange />
                {startDate ? (
                  <span className="text-foreground">Start {formatDueDate(startDate)}</span>
                ) : (
                  'Start date'
                )}
              </Chip>
            </DatePicker>
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
            <p id={`${uid}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!name.trim() || pending}
              onClick={() => submit(undefined, true)}
            >
              Create and open
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              Create epic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
