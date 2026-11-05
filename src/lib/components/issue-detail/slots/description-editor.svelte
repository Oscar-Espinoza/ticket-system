<!--
  Owner: B1 (editor swap: D1, collaboration: D2). Click-to-edit description in
  the WYSIWYG editor. While open it's a shared Yjs document (key
  `issue:<id>`, relayed through /api/collab): teammates' text and carets show
  live, and the markdown is saved back through mutations.update 1.5 s after
  local typing stops (and on close), so activity and notifications see one
  change per pause, not per keystroke. Newly @mentioned people are announced.
  Falls back to the single-user editor (save on blur / ⌘Enter / Esc) when the
  collab API is unreachable, for just-created issues, and for descriptions the
  rich editor can't represent (tables, raw HTML → raw Markdown mode).
-->
<script lang="ts">
  import { announceDescriptionMentions } from '@/lib/actions/comments';
  import { Markdown, MarkdownEditor } from '@/lib/components/editor';
  import { isPendingIssue, type IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { newMentionIds } from '@/lib/mentions';
  import { useDraft } from '../use-draft.svelte';
  import CollaborativeDescription from './collaborative-description.svelte';

  let {
    issue,
    mutations,
    readOnly = false,
  }: {
    issue: IssueRow;
    mutations: IssueMutations;
    readOnly?: boolean;
  } = $props();

  const saved = $derived(issue.description ?? '');
  const draft = useDraft(() => saved);
  let editing = $state(false);
  // Collaboration unavailable (API down / content it can't hold) for this issue.
  let singleUser = $state<string | null>(null);
  // Blur, Esc and ⌘Enter can all fire while closing; commit once.
  let open = false;
  const setEditing = (value: boolean) => {
    open = value;
    editing = value;
  };

  // `previous` is the saved description before the update (React's render-time
  // `saved`; here the optimistic update is visible right after the call).
  function announce(previous: string, value: string) {
    if (newMentionIds(previous, value).length > 0) {
      announceDescriptionMentions({
        projectId: issue.projectId,
        ticketId: issue.id,
        previous,
        next: value,
      }).catch(() => {
        // Best effort: the description itself is saved by the update above.
      });
    }
  }

  function commit(next: string) {
    const previous = saved;
    const value = next.trim();
    if (value === previous) return;
    mutations.update(issue, { description: value || null });
    announce(previous, value);
  }

  // Snapshot saves of the collaborative doc (as you type, and on open when the
  // doc is newer than the stored markdown).
  function commitCollab(next: string) {
    const previous = saved;
    const value = next.trim();
    mutations.saveCollabDescription(issue, value || null);
    if (value !== previous) announce(previous, value);
  }

  function finish() {
    if (!open) return;
    setEditing(false);
    commit(draft.current);
  }

  // The collaborative editor saves as you type (and flushes on unmount).
  function close() {
    if (open) setEditing(false);
  }

  function startEditing(e: MouseEvent) {
    // Links, task checkboxes and text selection keep their own behavior.
    if ((e.target as HTMLElement).closest('a, input, button')) return;
    if (window.getSelection()?.toString()) return;
    setEditing(true);
  }
</script>

{#if editing && !readOnly}
  {#if singleUser !== issue.id && !isPendingIssue(issue)}
    {#key issue.id}
      <CollaborativeDescription
        {issue}
        {saved}
        onSave={commitCollab}
        onClose={close}
        onUnavailable={() => (singleUser = issue.id)}
      />
    {/key}
  {:else}
    <MarkdownEditor
      aria-label="Description"
      value={draft.current}
      onChange={(value: string) => (draft.current = value)}
      onSubmit={finish}
      onCancel={finish}
      onBlur={finish}
      placeholder="Add a description… (type / for commands)"
      autoFocus
      projectId={issue.projectId}
      ticketId={isPendingIssue(issue) ? undefined : issue.id}
      textareaClassName="min-h-32"
    />
  {/if}
{:else if !saved}
  {#if readOnly}
    <p class="px-1 text-sm text-muted-foreground">No description.</p>
  {:else}
    <button
      type="button"
      onclick={() => setEditing(true)}
      class="min-h-16 rounded-md px-1 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40"
    >
      Add a description…
    </button>
  {/if}
{:else if readOnly}
  <div class="px-1">
    <Markdown source={saved} />
  </div>
{:else}
  <div
    role="button"
    tabindex={0}
    aria-label="Edit description"
    onclick={startEditing}
    onkeydown={(e) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) {
        e.preventDefault();
        setEditing(true);
      }
    }}
    class="cursor-text rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50"
  >
    <Markdown source={saved} onToggleTask={commit} />
  </div>
{/if}
