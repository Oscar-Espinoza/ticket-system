<!--
  CreateProjectDialog: a dialog triggered by the "New project" button, not a dedicated route.

  The ticket key auto-uppercases and strips non-A-Z characters on every keystroke,
  capped at 6 chars. Validation (2-char minimum, uniqueness) happens on submit.
  The form posts to the createProject server action through its generated
  (prevState, formData) wrapper — form state + pending, by hand.
  Project templates an optional Template select, loaded when the dialog opens.
-->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { createProject, type CreateProjectState } from '@/lib/actions/projects';
  import TemplateSelect from '@/lib/components/project-templates/template-select.svelte';
  import { useProjectTemplates } from '@/lib/components/project-templates/template-select.svelte.ts';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';

  let {
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    hideTrigger = false,
  }: {
    /** Controlled open state (palette/`C` instance); omit for local state. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Hide the "New project" trigger button (the palette is the trigger). */
    hideTrigger?: boolean;
  } = $props();

  let internalOpen = $state(false);
  let ticketKey = $state('');
  let templateId = $state('');

  const isControlled = $derived(controlledOpen !== undefined);
  const open = $derived(isControlled ? (controlledOpen ?? false) : internalOpen);
  function setOpen(next: boolean) {
    if (!isControlled) internalOpen = next;
    controlledOnOpenChange?.(next);
  }

  // This dialog mounts more than once per page (section header + empty
  // state CTA). Derive all field/error ids from a $props.id() prefix so the two
  // instances never collide on duplicate DOM ids (which would break
  // aria-describedby / for associations for screen readers).
  const uid = $props.id();
  const nameId = `${uid}-name`;
  const nameErrorId = `${uid}-name-error`;
  const keyId = `${uid}-key`;
  const keyErrorId = `${uid}-key-error`;
  const keyHintId = `${uid}-key-hint`;
  const templateFieldId = `${uid}-template`;
  const templates = useProjectTemplates(() => open);

  // Form state + pending flag.
  let formState = $state<CreateProjectState>({});
  let isPending = $state(false);
  let nameInput = $state<HTMLInputElement | null>(null);

  // Success side effects run inside the submit (not an effect) so they fire on
  // EVERY successful submit.
  async function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    isPending = true;
    try {
      const result = await createProject(formState, formData);
      if (result.success) {
        setOpen(false);
        ticketKey = '';
        templateId = '';
        toast.success('Project created');
      }
      formState = result;
      // Reset the form after the action: the uncontrolled name
      // field is cleared (the controlled ticket key / template keep their state).
      if (nameInput) nameInput.value = '';
    } finally {
      isPending = false;
    }
  }
</script>

<!-- Trigger button — shown in the dashboard section header and empty
     state; hidden for the palette-owned instance (hideTrigger) -->
{#if !hideTrigger}
  <Button onclick={() => setOpen(true)}>
    <PlusIcon class="mr-2 h-4 w-4" />
    New project
  </Button>
{/if}

<Dialog {open} onOpenChange={setOpen}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Create project</DialogTitle>
      <!-- DialogDescription is sr-only: provides context for screen readers
           without rendering visible text per 02-UI-SPEC §Create-Project Dialog -->
      <DialogDescription class="sr-only">
        Enter a project name and ticket key to create a new project.
      </DialogDescription>
    </DialogHeader>

    <form {onsubmit} class="flex flex-col gap-4">
      <!-- Project name field -->
      <div class="flex flex-col gap-1.5">
        <Label for={nameId}>Project name</Label>
        <Input
          bind:ref={nameInput}
          id={nameId}
          name="name"
          placeholder="My project"
          aria-invalid={formState.errors?.name ? true : undefined}
          aria-describedby={formState.errors?.name ? nameErrorId : undefined}
        />
        {#if formState.errors?.name}
          <p id={nameErrorId} class="text-destructive text-sm">
            {formState.errors.name}
          </p>
        {/if}
      </div>

      <!-- Ticket key field — controlled input with per-keystroke transform -->
      <div class="flex flex-col gap-1.5">
        <Label for={keyId}>Ticket key</Label>
        <Input
          id={keyId}
          name="ticketKey"
          placeholder="APP"
          value={ticketKey}
          oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
            // Auto-uppercase, strip non-A-Z, cap at 6 chars.
            // Client transform is UX only — server re-validates on submit.
            const transformed = event.currentTarget.value
              .toUpperCase()
              .replace(/[^A-Z]/g, '')
              .slice(0, 6);
            ticketKey = transformed;
            // Controlled: write the result back even when the
            // state didn't change (a rejected keystroke leaves ticketKey as is).
            event.currentTarget.value = transformed;
          }}
          aria-invalid={formState.errors?.ticketKey ? true : undefined}
          aria-describedby={formState.errors?.ticketKey ? `${keyErrorId} ${keyHintId}` : keyHintId}
        />
        <!-- Always-visible helper text (02-UI-SPEC §Copywriting Contract) -->
        <p id={keyHintId} class="text-muted-foreground text-sm">2–6 uppercase letters, unique across all projects.</p>
        {#if formState.errors?.ticketKey}
          <p id={keyErrorId} class="text-destructive text-sm">
            {formState.errors.ticketKey}
          </p>
        {/if}
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for={templateFieldId}>Template</Label>
        <input type="hidden" name="templateId" value={templateId} />
        <TemplateSelect
          id={templateFieldId}
          templates={templates.current}
          value={templateId}
          onChange={(next: string) => (templateId = next)}
        />
        {#if formState.errors?.templateId}
          <p class="text-destructive text-sm">{formState.errors.templateId}</p>
        {/if}
      </div>

      <!-- Server-level error (e.g. "Not authenticated", unexpected failure) -->
      {#if formState.errors?.server}
        <p class="text-destructive text-sm">{formState.errors.server}</p>
      {/if}

      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => setOpen(false)}>Discard</Button>
        <Button type="submit" disabled={isPending}>
          {#if isPending}
            <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
            Creating&hellip;
          {:else}
            Create project
          {/if}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
