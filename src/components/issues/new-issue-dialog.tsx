'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  registerNewIssueHost,
  type NewIssueSeed,
} from '@/components/productivity/new-issue-bus';
import { PropertyChips } from '@/components/productivity/property-chips';
import { TemplateMenu } from '@/components/productivity/template-menu';
import { templateProps, type IssueTemplate } from '@/components/productivity/templates-store';
import { useDraftAutosave } from '@/components/productivity/use-draft-autosave';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { PossibleDuplicates } from '@/components/similar/possible-duplicates';
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
import type { IssuePatch } from '@/lib/issue-model';
import { defaultNewIssueState } from '@/lib/workflow';
import type { IssueMutations } from './use-issue-mutations';

const NO_DEFAULTS: IssuePatch = {};
const CREATE_MORE_KEY = 'new-issue-create-more';

function readCreateMore() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(CREATE_MORE_KEY) === '1';
  } catch {
    return false;
  }
}

// The dialog closes on submit and the issue appears optimistically; on failure
// it reopens with the text (this component stays mounted, so state survives).
// Text autosaves as a draft (issue_draft) and the draft is deleted once the
// issue exists. "Create more" keeps the dialog open for the next issue.
export function NewIssueDialog({
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
}) {
  const data = useProjectData();
  const { states, project } = data;
  const canWrite = useProjectPermission('write');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [props, setProps] = useState<IssuePatch>(defaults);
  const [propsFor, setPropsFor] = useState(defaults);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(readCreateMore);
  if (defaults !== propsFor) {
    setPropsFor(defaults);
    setProps(defaults);
  }
  const uid = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const autosave = useDraftAutosave(project.id, canWrite);

  const state = states.find((s) => s.id === props.stateId) ?? defaultNewIssueState(states);
  const hasContent = Boolean(title.trim() || description.trim());

  /** Apply an edit and schedule the draft save (only once there is text). */
  function edit(next: { title?: string; description?: string; props?: IssuePatch }) {
    const t = next.title ?? title;
    const d = next.description ?? description;
    const p = next.props ?? props;
    if (next.title !== undefined) setTitle(t);
    if (next.description !== undefined) setDescription(d);
    if (next.props !== undefined) setProps(p);
    if (!canWrite) return;
    if (!t.trim() && !d.trim()) {
      // Emptied out: an empty draft is no draft.
      if (draftId) autosave.discard(draftId);
      else autosave.cancel();
      setDraftId(null);
      return;
    }
    const id = draftId ?? crypto.randomUUID();
    if (!draftId) setDraftId(id);
    autosave.schedule({ id, title: t, description: d, props: p });
  }

  const set = (patch: IssuePatch) => edit({ props: { ...props, ...patch } });

  const applyTemplate = (template: IssueTemplate) =>
    edit({
      title: title.trim() ? title : template.title,
      description: description.trim() ? description : template.description,
      props: { ...props, ...templateProps(template, data) },
    });

  const onRequest = useEffectEvent((seed?: NewIssueSeed) => {
    if (seed) {
      autosave.flush();
      autosave.reset();
      setTitle(seed.title ?? '');
      setDescription(seed.description ?? '');
      setProps({ ...seed.props });
      setDraftId(seed.draftId ?? null);
      setError(null);
    }
    onOpenChange(true);
  });

  useEffect(() => {
    if (!canWrite) return;
    return registerNewIssueHost({ fallback, open: (seed) => onRequest(seed) });
  }, [canWrite, fallback]);

  const close = () => {
    setError(null);
    autosave.flush();
    if (hasContent && draftId) {
      toast('Draft saved', {
        action: { label: 'View drafts', onClick: () => router.push('/dashboard/drafts') },
      });
    }
    onOpenChange(false);
  };

  const discard = () => {
    if (draftId) autosave.discard(draftId);
    setDraftId(null);
    setTitle('');
    setDescription('');
    setError(null);
    onOpenChange(false);
  };

  const toggleCreateMore = (next: boolean) => {
    setCreateMore(next);
    try {
      window.localStorage.setItem(CREATE_MORE_KEY, next ? '1' : '0');
    } catch {
      // Private mode: the toggle just isn't remembered.
    }
  };

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!title.trim()) return;
    const sent = { title, description, draftId };
    const more = createMore;
    autosave.cancel();
    setError(null);
    if (more) {
      // Next issue: fresh text and draft, same properties.
      setTitle('');
      setDescription('');
      setDraftId(null);
      autosave.reset();
      titleRef.current?.focus();
    } else {
      onOpenChange(false);
    }
    onCreate(
      { ...props, title, description, stateId: props.stateId ?? state?.id },
      {
        onSuccess: () => {
          if (!more) {
            setTitle('');
            setDescription('');
            setDraftId(null);
          }
          if (sent.draftId) autosave.discard(sent.draftId);
        },
        onError: (message) => {
          // Bring the text back unless the next issue (create more) is under way.
          const restore = (current: string, previous: string) =>
            current.trim() ? current : previous;
          setTitle((current) => restore(current, sent.title));
          setDescription((current) => restore(current, sent.description));
          setDraftId((current) => current ?? sent.draftId);
          setError(message);
          onOpenChange(true);
        },
      },
    );
  }

  const draftHint =
    draftId && hasContent
      ? autosave.status === 'saving'
        ? 'Saving draft…'
        : autosave.status === 'error'
          ? 'Draft not saved'
          : 'Draft saved'
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-2 pr-8">
          <DialogTitle>New issue</DialogTitle>
          <span className="font-mono text-xs text-muted-foreground">{project.ticketKey}</span>
          <DialogDescription className="sr-only">
            Title, description and properties of the new {project.ticketKey} issue.
          </DialogDescription>
          <div className="ml-auto">
            <TemplateMenu enabled={open} onApply={applyTemplate} />
          </div>
        </DialogHeader>

        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`}>Title</Label>
            <Input
              ref={titleRef}
              id={`${uid}-title`}
              value={title}
              onChange={(e) => edit({ title: e.target.value })}
              placeholder="Issue title"
              maxLength={200}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
            />
            <PossibleDuplicates projectId={project.id} title={title} enabled={open && canWrite} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>Description</Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              onChange={(e) => edit({ description: e.target.value })}
              placeholder="Add a description…"
              rows={5}
            />
          </div>

          <PropertyChips value={props} onChange={set} fallbackState={state} />

          {error && (
            <p id={`${uid}-error`} className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
              {draftHint && (
                <>
                  <span aria-live="polite">{draftHint}</span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-xs text-muted-foreground"
                    onClick={discard}
                  >
                    Discard
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch size="sm" checked={createMore} onCheckedChange={toggleCreateMore} />
                Create more
              </label>
              <Button type="submit" disabled={!title.trim()}>
                Create issue
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
