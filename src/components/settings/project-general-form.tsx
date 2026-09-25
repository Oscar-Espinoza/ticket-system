'use client';

import { useActionState, useEffect, useState } from 'react';
import { AlertTriangle, LayoutTemplate, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  changeProjectKey,
  deleteProject,
  updateProjectDetails,
  updateProjectParent,
  updateProjectVisibility,
  type ProjectSettingsState,
  type ProjectVisibility,
} from '@/app/actions/project-settings';
import {
  TemplateDialog,
  type TemplateWorkspaceOption,
} from '@/components/project-templates/template-dialog';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  workspaceId: string | null;
  workspaceName: string | null;
  /** Current parent team (only when it's one of `parentOptions`). */
  parentId: string | null;
  /** Teams this one may be nested under (same workspace, viewer is a member). */
  parentOptions: { id: string; name: string; ticketKey: string }[];
  visibility: ProjectVisibility;
  /** Workspaces a template saved from here can be shared with. */
  templateWorkspaces: TemplateWorkspaceOption[];
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
      <TeamStructure {...props} />
      <Separator className="my-10" />
      <KeyForm {...props} />
      {canEdit && (
        <>
          <Separator className="my-10" />
          <SaveAsTemplate {...props} />
        </>
      )}
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

const NO_PARENT = 'none';

function TeamStructure(props: ProjectGeneralFormProps) {
  const { workspaceName } = props;
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-medium">Team structure</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspaceName ? (
            <>
              Where this team sits in <span className="text-foreground">{workspaceName}</span> and
              who can find it.
            </>
          ) : (
            'Parent teams and visibility apply once the project is in a workspace.'
          )}
        </p>
      </div>
      <ParentForm {...props} />
      <VisibilityForm {...props} />
    </section>
  );
}

function ParentForm({ projectId, workspaceId, parentId, parentOptions, canEdit }: ProjectGeneralFormProps) {
  const [state, action, pending] = useActionState(updateProjectParent, {});
  useResultToast(state, 'Parent team updated');
  const [value, setValue] = useState(parentId ?? NO_PARENT);
  const disabled = !canEdit || !workspaceId;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="parentId" value={value === NO_PARENT ? '' : value} />
      <Field
        id="project-parent"
        label="Parent team"
        hint="Sub-teams are listed under their parent in the sidebar and workspace. Issues stay separate."
        error={state.errors?.parentId}
      >
        <Select value={value} onValueChange={setValue} disabled={disabled}>
          <SelectTrigger id="project-parent" className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PARENT}>No parent</SelectItem>
            {parentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="font-mono text-xs text-muted-foreground">{option.ticketKey}</span>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {!disabled && (
        <div>
          <Button
            type="submit"
            variant="outline"
            disabled={pending || value === (parentId ?? NO_PARENT)}
          >
            {pending && <Loader2 className="animate-spin" />}
            Save parent
          </Button>
        </div>
      )}
    </form>
  );
}

const VISIBILITY_COPY: Record<ProjectVisibility, { label: string; hint: string }> = {
  private: {
    label: 'Private',
    hint: 'Only members can see this team. Others join by invitation.',
  },
  workspace: {
    label: 'Workspace',
    hint: 'Everyone in the workspace can find this team and join it as a member.',
  },
};

function VisibilityForm({ projectId, visibility, workspaceId, canEdit }: ProjectGeneralFormProps) {
  const [state, action, pending] = useActionState(updateProjectVisibility, {});
  useResultToast(state, 'Visibility updated');
  const [value, setValue] = useState<ProjectVisibility>(visibility);
  const disabled = !canEdit || !workspaceId;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="visibility" value={value} />
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">Visibility</legend>
        <RadioGroup
          value={value}
          onValueChange={(next) => setValue(next as ProjectVisibility)}
          disabled={disabled}
          className="gap-3"
        >
          {(Object.keys(VISIBILITY_COPY) as ProjectVisibility[]).map((option) => (
            <div key={option} className="flex items-start gap-2.5">
              <RadioGroupItem id={`visibility-${option}`} value={option} className="mt-0.5" />
              <Label htmlFor={`visibility-${option}`} className="flex flex-col items-start gap-0.5">
                <span>{VISIBILITY_COPY[option].label}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {VISIBILITY_COPY[option].hint}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {state.errors?.visibility && (
          <p role="alert" className="text-xs text-destructive">
            {state.errors.visibility}
          </p>
        )}
      </fieldset>
      {!disabled && (
        <div>
          <Button type="submit" variant="outline" disabled={pending || value === visibility}>
            {pending && <Loader2 className="animate-spin" />}
            Save visibility
          </Button>
        </div>
      )}
    </form>
  );
}

function SaveAsTemplate({ projectId, name, ticketKey, workspaceId, templateWorkspaces }: ProjectGeneralFormProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">Project template</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reuse this project&rsquo;s workflow, labels, estimates, cycle and triage settings, SLAs
          and issue templates when creating new projects.
        </p>
      </div>
      <Button variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        <LayoutTemplate />
        Save as template…
      </Button>
      <TemplateDialog
        open={open}
        onOpenChange={setOpen}
        fixedProject={{ id: projectId, name, ticketKey }}
        workspaces={templateWorkspaces}
        defaultWorkspaceId={workspaceId}
      />
    </section>
  );
}
