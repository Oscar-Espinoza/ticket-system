<!--
  The new-issue dialog. It closes on submit and the issue appears
  optimistically; on failure it reopens with the text (this component stays
  mounted, so state survives). Text autosaves as a draft (issue_draft) and the
  draft is deleted once the issue exists. "Create more" keeps the dialog open
  for the next issue.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { goto } from '$app/navigation';

  import { registerNewIssueHost, type NewIssueSeed } from '@/lib/components/productivity/new-issue-bus.svelte';
  import PropertyChips from '@/lib/components/productivity/property-chips.svelte';
  import TemplateMenu from '@/lib/components/productivity/template-menu.svelte';
  import { templateProps, type IssueTemplate } from '@/lib/components/productivity/templates-store.svelte';
  import { useDraftAutosave } from '@/lib/components/productivity/use-draft-autosave.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import PossibleDuplicates from '@/lib/components/similar/possible-duplicates.svelte';
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
  import { Switch } from '@/lib/components/ui/switch';
  import { Textarea } from '@/lib/components/ui/textarea';
  import type { IssuePatch } from '@/lib/issue-model';
  import { readStorage, writeStorage } from '@/lib/svelte/storage';
  import { defaultNewIssueState } from '@/lib/workflow';
  import type { IssueMutations } from './use-issue-mutations.svelte';

  const NO_DEFAULTS: IssuePatch = {};
  const CREATE_MORE_KEY = 'new-issue-create-more';

  function readCreateMore() {
    return readStorage(CREATE_MORE_KEY) === '1';
  }

  let {
    open,
    onOpenChange,
    defaults = NO_DEFAULTS,
    onCreate,
    fallback = false,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Initial properties (e.g. a board column's { stateId }); a new object resets them. */
    defaults?: IssuePatch;
    onCreate: IssueMutations['create'];
    /**
     * Only receives `requestNewIssue` (the `c` key, drafts, templates) when the
     * page has no other dialog — IssueShortcuts' own instance.
     */
    fallback?: boolean;
  } = $props();

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  let title = $state('');
  let description = $state('');
  let error = $state<string | null>(null);
  let properties = $state.raw<IssuePatch>(untrack(() => defaults));
  let draftId = $state<string | null>(null);
  let createMore = $state(readCreateMore());
  // A new `defaults` object resets the properties (compared by identity).
  let propsFor = untrack(() => defaults);
  $effect.pre(() => {
    const next = defaults;
    if (next === propsFor) return;
    propsFor = next;
    properties = next;
  });
  const uid = $props.id();
  let titleRef = $state<HTMLInputElement | null>(null);
  const autosave = useDraftAutosave(
    () => data.project.id,
    () => canWrite.current,
  );

  const newState = $derived(data.states.find((s) => s.id === properties.stateId) ?? defaultNewIssueState(data.states));
  const hasContent = $derived(Boolean(title.trim() || description.trim()));

  /** Apply an edit and schedule the draft save (only once there is text). */
  function edit(next: { title?: string; description?: string; props?: IssuePatch }) {
    const t = next.title ?? title;
    const d = next.description ?? description;
    const p = next.props ?? properties;
    if (next.title !== undefined) title = t;
    if (next.description !== undefined) description = d;
    if (next.props !== undefined) properties = p;
    if (!canWrite.current) return;
    if (!t.trim() && !d.trim()) {
      // Emptied out: an empty draft is no draft.
      if (draftId) autosave.discard(draftId);
      else autosave.cancel();
      draftId = null;
      return;
    }
    const id = draftId ?? crypto.randomUUID();
    if (!draftId) draftId = id;
    autosave.schedule({ id, title: t, description: d, props: p });
  }

  const set = (patch: IssuePatch) => edit({ props: { ...properties, ...patch } });

  const applyTemplate = (template: IssueTemplate) =>
    edit({
      title: title.trim() ? title : template.title,
      description: description.trim() ? description : template.description,
      props: { ...properties, ...templateProps(template, data) },
    });

  const onRequest = (seed?: NewIssueSeed) => {
    if (seed) {
      autosave.flush();
      autosave.reset();
      title = seed.title ?? '';
      description = seed.description ?? '';
      properties = { ...seed.props };
      draftId = seed.draftId ?? null;
      error = null;
    }
    onOpenChange(true);
  };

  $effect(() => {
    if (!canWrite.current) return;
    const isFallback = fallback;
    return untrack(() => registerNewIssueHost({ fallback: isFallback, open: (seed) => onRequest(seed) }));
  });

  const close = () => {
    error = null;
    autosave.flush();
    if (hasContent && draftId) {
      toast('Draft saved', {
        action: { label: 'View drafts', onClick: () => void goto('/dashboard/drafts') },
      });
    }
    onOpenChange(false);
  };

  const discard = () => {
    if (draftId) autosave.discard(draftId);
    draftId = null;
    title = '';
    description = '';
    error = null;
    onOpenChange(false);
  };

  const toggleCreateMore = (next: boolean) => {
    createMore = next;
    writeStorage(CREATE_MORE_KEY, next ? '1' : '0');
  };

  function submit(event?: Event) {
    event?.preventDefault();
    if (!title.trim()) return;
    const sent = { title, description, draftId };
    const more = createMore;
    autosave.cancel();
    error = null;
    if (more) {
      // Next issue: fresh text and draft, same properties.
      title = '';
      description = '';
      draftId = null;
      autosave.reset();
      titleRef?.focus();
    } else {
      onOpenChange(false);
    }
    onCreate(
      { ...properties, title: sent.title, description: sent.description, stateId: properties.stateId ?? newState?.id },
      {
        onSuccess: () => {
          if (!more) {
            title = '';
            description = '';
            draftId = null;
          }
          if (sent.draftId) autosave.discard(sent.draftId);
        },
        onError: (message) => {
          // Bring the text back unless the next issue (create more) is under way.
          const restore = (current: string, previous: string) => (current.trim() ? current : previous);
          title = restore(title, sent.title);
          description = restore(description, sent.description);
          draftId = draftId ?? sent.draftId;
          error = message;
          onOpenChange(true);
        },
      },
    );
  }

  const draftHint = $derived(
    draftId && hasContent
      ? autosave.status === 'saving'
        ? 'Saving draft…'
        : autosave.status === 'error'
          ? 'Draft not saved'
          : 'Draft saved'
      : null,
  );
</script>

<Dialog {open} onOpenChange={(next: boolean) => (next ? onOpenChange(true) : close())}>
  <!-- Focus goes to the title before Radix's focus scope runs
       (so it stayed there); bits-ui would otherwise focus the first tabbable
       (the Template button once templates load). -->
  <DialogContent
    class="sm:max-w-xl"
    onOpenAutoFocus={(event: Event) => {
      if (!titleRef) return;
      event.preventDefault();
      titleRef.focus();
    }}
  >
    <DialogHeader class="flex-row items-center gap-2 pr-8">
      <DialogTitle>New issue</DialogTitle>
      <span class="font-mono text-xs text-muted-foreground">{data.project.ticketKey}</span>
      <DialogDescription class="sr-only">
        Title, description and properties of the new {data.project.ticketKey} issue.
      </DialogDescription>
      <div class="ml-auto">
        <TemplateMenu enabled={open} onApply={applyTemplate} />
      </div>
    </DialogHeader>

    <!-- ⌘/Ctrl+Enter submits from any field. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form
      onsubmit={submit}
      onkeydown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
      }}
      class="flex flex-col gap-4"
    >
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-title`}>Title</Label>
        <Input
          bind:ref={titleRef}
          id={`${uid}-title`}
          bind:value={() => title, (next) => edit({ title: next ?? '' })}
          placeholder="Issue title"
          maxlength={200}
          autofocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-error` : undefined}
        />
        <PossibleDuplicates projectId={data.project.id} {title} enabled={open && canWrite.current} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-description`}>Description</Label>
        <Textarea
          id={`${uid}-description`}
          bind:value={() => description, (next) => edit({ description: next ?? '' })}
          placeholder="Add a description…"
          rows={5}
        />
      </div>

      <PropertyChips value={properties} onChange={set} fallbackState={newState} />

      {#if error}
        <p id={`${uid}-error`} class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter class="items-center sm:justify-between">
        <div class="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
          {#if draftHint}
            <span aria-live="polite">{draftHint}</span>
            <Button
              type="button"
              variant="link"
              size="xs"
              class="h-auto px-0 text-xs text-muted-foreground"
              onclick={discard}
            >
              Discard
            </Button>
          {/if}
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch size="sm" checked={createMore} onCheckedChange={toggleCreateMore} />
            Create more
          </label>
          <Button type="submit" disabled={!title.trim()}>Create issue</Button>
        </div>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
