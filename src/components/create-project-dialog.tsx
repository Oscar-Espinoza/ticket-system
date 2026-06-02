'use client';

// CreateProjectDialog — PROJ-01 client component.
//
// D-16: shadcn Dialog triggered by "New project" button, NOT a dedicated route.
// D-17: ticket key auto-uppercases and strips non-A-Z characters on every keystroke,
//       capped at 6 chars. Validation (2-char minimum, uniqueness) happens on submit.
// The form uses useActionState with the createProject Server Action so the pending
// state, field errors, and success handling are fully integrated.

import { useActionState, useEffect, useState } from 'react';
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
  const [state, action, isPending] = useActionState(createProject, initialState);

  // Close dialog and reset ticket key state when the server confirms success.
  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setTicketKey('');
    }
  }, [state.success]);

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
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                name="name"
                placeholder="My project"
                aria-invalid={state.errors?.name ? true : undefined}
                aria-describedby={state.errors?.name ? 'name-error' : undefined}
              />
              {state.errors?.name && (
                <p id="name-error" className="text-destructive text-sm">
                  {state.errors.name}
                </p>
              )}
            </div>

            {/* Ticket key field — controlled input with per-keystroke transform */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-key">Ticket key</Label>
              <Input
                id="ticket-key"
                name="ticketKey"
                placeholder="APP"
                value={ticketKey}
                aria-invalid={state.errors?.ticketKey ? true : undefined}
                aria-describedby={
                  state.errors?.ticketKey
                    ? 'ticketKey-error ticketKey-hint'
                    : 'ticketKey-hint'
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
              <p id="ticketKey-hint" className="text-muted-foreground text-sm">
                2–6 uppercase letters, unique across all projects.
              </p>
              {state.errors?.ticketKey && (
                <p id="ticketKey-error" className="text-destructive text-sm">
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
