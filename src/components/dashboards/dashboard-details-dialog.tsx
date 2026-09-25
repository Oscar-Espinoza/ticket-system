'use client';

// Create a dashboard (name, scope, description) or rename an existing one.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createDashboard, updateDashboard } from '@/app/actions/dashboards';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { dashboardHref } from './widget-model';

const ALL = '__all';

export function DashboardDetailsDialog({
  open,
  onOpenChange,
  dashboard,
  projects = [],
  defaultProjectId = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode; omit to create. */
  dashboard?: { id: string; name: string; description: string | null };
  /** Create mode: scopes to choose from. */
  projects?: { id: string; name: string }[];
  defaultProjectId?: string | null;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <DetailsForm
            dashboard={dashboard}
            projects={projects}
            defaultProjectId={defaultProjectId}
            onDone={() => {
              onOpenChange(false);
              onSaved?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailsForm({
  dashboard,
  projects,
  defaultProjectId,
  onDone,
}: {
  dashboard?: { id: string; name: string; description: string | null };
  projects: { id: string; name: string }[];
  defaultProjectId: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(dashboard?.name ?? '');
  const [description, setDescription] = useState(dashboard?.description ?? '');
  const [scope, setScope] = useState(defaultProjectId ?? ALL);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = dashboard
        ? await updateDashboard({ id: dashboard.id, name, description })
        : await createDashboard({ name, description, projectId: scope === ALL ? null : scope });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDone();
      if (!dashboard) router.push(dashboardHref(result.id));
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{dashboard ? 'Rename dashboard' : 'New dashboard'}</DialogTitle>
        {!dashboard && (
          <DialogDescription>
            Starts with a few widgets you can edit. Project dashboards can be shared with the project.
          </DialogDescription>
        )}
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dashboard-name">Name</Label>
        <Input
          id="dashboard-name"
          value={name}
          maxLength={80}
          autoFocus
          required
          placeholder="Team health"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {!dashboard && (
        <div className="flex flex-col gap-1.5">
          <Label>Scope</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger aria-label="Scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All my projects (personal)</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dashboard-description">Description</Label>
        <Textarea
          id="dashboard-description"
          value={description}
          maxLength={500}
          rows={2}
          placeholder="Optional"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          {dashboard ? 'Save' : 'Create dashboard'}
        </Button>
      </DialogFooter>
    </form>
  );
}
