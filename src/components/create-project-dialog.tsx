'use client';

// CreateProjectDialog — PROJ-01 client component.
//
// D-16: shadcn Dialog triggered by "New project" button, NOT a dedicated route.
// D-17: ticket key auto-uppercases and strips non-A-Z characters on every keystroke,
//       capped at 6 chars. Validation (2-char minimum, uniqueness) happens on submit.
// The form uses useActionState with the createProject Server Action so the pending
// state, field errors, and success handling are fully integrated.

import { useActionState, useId, useState } from 'react';
import { createProject, type CreateProjectState } from '@/app/actions/projects';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';

const initialState: CreateProjectState = {};

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [ticketKey, setTicketKey] = useState('');

  // IN-03: this dialog mounts more than once per page (section header + empty
  // state CTA). Derive all field/error ids from a useId() prefix so the two
  // instances never collide on duplicate DOM ids (which would break
  // aria-describedby / htmlFor associations for screen readers).
  const uid = useId();
  const nameId = `${uid}-name`;
  const nameErrorId = `${uid}-name-error`;
  const keyId = `${uid}-key`;
  const keyErrorId = `${uid}-key-error`;
  const keyHintId = `${uid}-key-hint`;

  // Run success side effects inside the action (not an effect) so they fire on
  // EVERY successful submit. Keying an effect off `state.success` only fired on
  // the first true (true→true is not a dependency change), so a 2nd create left
  // the dialog open and the controlled ticketKey populated (02-REVIEW WR-04).
  const [state, action, isPending] = useActionState(
    async (prevState: CreateProjectState, formData: FormData) => {
      const result = await createProject(prevState, formData);
      if (result.success) {
        setOpen(false);
        setTicketKey('');
      }
      return result;
    },
    initialState,
  );

  return (
    <>
      {/* Trigger button — shown in the dashboard section header and empty state */}
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New project
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            {/* DialogDescription is sr-only: provides context for screen readers
                without rendering visible text per 02-UI-SPEC §Create-Project Dialog */}
            <DialogDescription className="sr-only">
              Enter a project name and ticket key to create a new project.
            </DialogDescription>
          </DialogHeader>

          <form action={action} className="flex flex-col gap-4">
            {/* Project name field */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Project name</Label>
              <Input
                id={nameId}
                name="name"
                placeholder="My project"
                aria-invalid={state.errors?.name ? true : undefined}
                aria-describedby={state.errors?.name ? nameErrorId : undefined}
              />
              {state.errors?.name && (
                <p id={nameErrorId} className="text-destructive text-sm">
                  {state.errors.name}
                </p>
              )}
            </div>

            {/* Ticket key field — controlled input with per-keystroke transform */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={keyId}>Ticket key</Label>
              <Input
                id={keyId}
                name="ticketKey"
                placeholder="APP"
                value={ticketKey}
                aria-invalid={state.errors?.ticketKey ? true : undefined}
                aria-describedby={
                  state.errors?.ticketKey
                    ? `${keyErrorId} ${keyHintId}`
                    : keyHintId
                }
                onChange={(e) => {
                  // D-17: auto-uppercase, strip non-A-Z, cap at 6 chars.
                  // Client transform is UX only — server re-validates on submit.
                  const transformed = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 6);
                  setTicketKey(transformed);
                }}
              />
              {/* Always-visible helper text (02-UI-SPEC §Copywriting Contract) */}
              <p id={keyHintId} className="text-muted-foreground text-sm">
                2–6 uppercase letters, unique across all projects.
              </p>
              {state.errors?.ticketKey && (
                <p id={keyErrorId} className="text-destructive text-sm">
                  {state.errors.ticketKey}
                </p>
              )}
            </div>

            {/* Server-level error (e.g. "Not authenticated", unexpected failure) */}
            {state.errors?.server && (
              <p className="text-destructive text-sm">{state.errors.server}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Discard
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating&hellip;
                  </>
                ) : (
                  'Create project'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
