'use client';

// "New workspace" dialog: name → URL slug (derived until edited). Opens the
// new workspace on success. Also registers a "Create workspace" palette
// command, so the sidebar slot that mounts it makes the action global.

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

import { createWorkspace } from '@/app/actions/workspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { sidebarRowClass } from '@/components/app-shell/sidebar-nav';
import { cn } from '@/lib/utils';
import { slugify } from './slug';

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string; server?: string }>({});
  const [isPending, startTransition] = useTransition();
  const effectiveSlug = slugEdited ? slug : slugify(name);

  function reset() {
    setName('');
    setSlug('');
    setSlugEdited(false);
    setErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createWorkspace({ name, slug: effectiveSlug });
      if (!result.ok) {
        const field = result.field === 'name' || result.field === 'slug' ? result.field : 'server';
        setErrors({ [field]: result.error });
        return;
      }
      toast.success('Workspace created');
      onOpenChange(false);
      reset();
      router.push(`/dashboard/workspaces/${result.slug}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Group related projects (teams) and plan initiatives across them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-name`}>Name</Label>
            <Input
              id={`${uid}-name`}
              autoFocus
              value={name}
              maxLength={60}
              placeholder="Acme Inc."
              onChange={(e) => {
                setName(e.target.value);
                setErrors({});
              }}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-slug`}>URL</Label>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="shrink-0">/workspaces/</span>
              <Input
                id={`${uid}-slug`}
                value={effectiveSlug}
                maxLength={40}
                placeholder="acme"
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setErrors({});
                }}
                aria-invalid={errors.slug ? true : undefined}
                className="font-mono"
              />
            </div>
            {errors.slug && <p className="text-sm text-destructive">{errors.slug}</p>}
          </div>
          {errors.server && <p className="text-sm text-destructive">{errors.server}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sidebar entry point: the dialog, its trigger (a `+` next to the section
 * heading, or a full row when the user has no workspace yet) and the global
 * "Create workspace" palette command.
 */
export function CreateWorkspaceTrigger({ variant }: { variant: 'icon' | 'row' }) {
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      registerPaletteCommands([
        {
          id: 'workspace.create',
          label: 'Create workspace',
          section: 'Workspaces',
          keywords: ['new', 'workspace', 'team', 'organization'],
          run: () => setOpen(true),
        },
      ]),
    [],
  );

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Create workspace"
          className="flex size-5 items-center justify-center rounded text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(sidebarRowClass, 'text-muted-foreground hover:bg-sidebar-accent/60')}
        >
          <Plus />
          <span className="truncate">Create a workspace</span>
        </button>
      )}
      <CreateWorkspaceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
