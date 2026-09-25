'use client';

// Name / describe / share a new saved view built from the current filters and
// display options, then open it. Remount (key) per open to reset the form.

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createView } from '@/app/actions/views';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export function SaveViewDialog({
  open,
  onOpenChange,
  projectId,
  filters,
  display,
  canShare,
  defaultName = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  filters: Record<string, unknown>;
  display: Record<string, unknown>;
  /** Members with write access may share views with the whole project. */
  canShare: boolean;
  defaultName?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) {
      setError('Give the view a name.');
      return;
    }
    startTransition(async () => {
      const result = await createView({
        projectId,
        name,
        description,
        shared: canShare && shared,
        filters,
        display,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Saved view “${name.trim()}”`);
      onOpenChange(false);
      router.push(`/dashboard/projects/${result.projectId}/views/${result.id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>
            Keeps the current filters, grouping, ordering and visible properties.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-name`}>Name</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              maxLength={80}
              autoFocus
              placeholder="e.g. My open bugs"
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              maxLength={500}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {canShare && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={`${uid}-shared`} className="flex flex-col items-start gap-0.5">
                Share with project
                <span className="text-xs font-normal text-muted-foreground">
                  Every project member can open this view.
                </span>
              </Label>
              <Switch id={`${uid}-shared`} checked={shared} onCheckedChange={setShared} />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
