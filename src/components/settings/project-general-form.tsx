'use client';

import { useActionState, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  changeProjectKey,
  deleteProject,
  updateProjectDetails,
  type ProjectSettingsState,
} from '@/app/actions/project-settings';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ESTIMATE_SCALES, ESTIMATE_SCALE_LABEL, isEstimateScale } from '@/lib/estimates';
import { Field } from './field';

export interface ProjectGeneralFormProps {
  projectId: string;
  name: string;
  ticketKey: string;
  description: string;
  estimateScale: string;
  /** Owner or admin: may edit details. */
  canEdit: boolean;
  /** Owner only: may change the key and delete the project. */
  isOwner: boolean;
}

/** Toast once per action result (server errors only; field errors render inline). */
function useResultToast(state: ProjectSettingsState, success: string) {
  useEffect(() => {
    if (state.success) toast.success(success);
    else if (state.errors?.server) toast.error(state.errors.server);
  }, [state, success]);
}

export function ProjectGeneralForm(props: ProjectGeneralFormProps) {
  const { canEdit, isOwner } = props;
  return (
    <div className="flex flex-col">
      {!canEdit && (
        <p className="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can change these settings.
        </p>
      )}
      <DetailsForm {...props} />
      <Separator className="my-10" />
      <KeyForm {...props} />
      {isOwner && (
        <>
          <Separator className="my-10" />
          <DangerZone projectId={props.projectId} name={props.name} />
        </>
      )}
    </div>
  );
}

function DetailsForm({
  projectId,
  name,
  description,
  estimateScale,
  canEdit,
}: ProjectGeneralFormProps) {
  const [state, action, pending] = useActionState(updateProjectDetails, {});
  useResultToast(state, 'Project updated');
  const errors = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <Field id="project-name" label="Name" error={errors.name}>
          <Input
            id="project-name"
            name="name"
            defaultValue={name}
            maxLength={100}
            required
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'project-name-error' : undefined}
          />
        </Field>
        <Field id="project-description" label="Description" error={errors.description}>
          <Textarea
            id="project-description"
            name="description"
            defaultValue={description}
            maxLength={2000}
            rows={3}
            placeholder="What does this project work on?"
            aria-invalid={!!errors.description}
          />
        </Field>
        <Field
          id="project-estimates"
          label="Estimates"
          hint="The point scale offered when estimating issues."
          error={errors.estimateScale}
        >
          <Select
            name="estimateScale"
            defaultValue={isEstimateScale(estimateScale) ? estimateScale : 'none'}
            disabled={!canEdit}
          >
            <SelectTrigger id="project-estimates" className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTIMATE_SCALES.map((scale) => (
                <SelectItem key={scale} value={scale}>
                  {ESTIMATE_SCALE_LABEL[scale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </fieldset>
      {canEdit && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}

function KeyForm({ projectId, ticketKey, isOwner }: ProjectGeneralFormProps) {
  const [state, action, pending] = useActionState(changeProjectKey, {});
  useResultToast(state, 'Issue key changed');
  const [value, setValue] = useState(ticketKey);
  const error = state.errors?.ticketKey;
  const changed = value !== ticketKey;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <h2 className="text-base font-medium">Issue key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The prefix of every issue ID, like <span className="font-mono">{ticketKey}-12</span>.
        </p>
      </div>
      <Field
        id="project-key"
        label="Key"
        hint={isOwner ? '2–6 uppercase letters.' : 'Only the project owner can change the key.'}
        error={error}
      >
        <Input
          id="project-key"
          name="ticketKey"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
          disabled={!isOwner}
          autoComplete="off"
          spellCheck={false}
          className="max-w-32 font-mono"
          aria-invalid={!!error}
          aria-describedby={error ? 'project-key-error' : undefined}
        />
      </Field>
      {isOwner && changed && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <span>
            Every issue ID changes from <span className="font-mono">{ticketKey}-…</span> to{' '}
            <span className="font-mono">{value || '…'}-…</span>. Links, branch names and commit
            messages that use the old IDs will no longer match.
          </span>
        </p>
      )}
      {isOwner && (
        <div>
          <Button type="submit" variant="outline" disabled={pending || !changed}>
            {pending && <Loader2 className="animate-spin" />}
            Change key
          </Button>
        </div>
      )}
    </form>
  );
}

function DangerZone({ projectId, name }: { projectId: string; name: string }) {
  const [state, action, pending] = useActionState(deleteProject, {});
  useResultToast(state, 'Project deleted');
  const [confirm, setConfirm] = useState('');

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium text-destructive">Delete project</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently deletes the project with all of its issues, comments, cycles and settings.
          Members lose access immediately.
        </p>
      </div>
      <AlertDialog onOpenChange={(open) => !open && setConfirm('')}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-fit">
            Delete project…
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form action={action} className="contents">
            <input type="hidden" name="projectId" value={projectId} />
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&rsquo;t be undone. Type <strong className="text-foreground">{name}</strong>{' '}
                to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field id="delete-confirm" label="Project name" error={state.errors?.confirm}>
              <Input
                id="delete-confirm"
                name="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                aria-invalid={!!state.errors?.confirm}
              />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || confirm.trim() !== name}
              >
                {pending && <Loader2 className="animate-spin" />}
                Delete project
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
