<!--
  Rendered once next to the issues view: Space on a
  focused list row opens a read-only preview; Enter there opens the detail
  pane via `onOpen`. Guarded to `[data-issue-row]` focus so the board's own
  Space pick-up (dnd-kit, on board cards) is untouched.
-->
<script lang="ts">
  import { issueRowIdAt } from '@/lib/components/issues/issue-dom';
  import IssuePeek from '@/lib/components/navigation/issue-peek.svelte';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import type { IssueRow } from '@/lib/issue-model';

  let { issues, onOpen }: { issues: IssueRow[]; onOpen: (issue: IssueRow) => void } = $props();

  function focusedRowId(event: KeyboardEvent): string | null {
    const target = event.target instanceof Element ? event.target : null;
    return issueRowIdAt(target);
  }

  let peekId = $state<string | null>(null);
  // Always the latest copy (optimistic edits), and closes if it leaves the list.
  const peeked = $derived(peekId ? (issues.find((i) => i.id === peekId) ?? null) : null);

  const peek = (event: KeyboardEvent) => {
    const id = focusedRowId(event);
    if (id && issues.some((i) => i.id === id)) peekId = id;
  };

  $effect(() =>
    registerHotkeys([
      {
        key: ' ',
        scope: 'Issues',
        description: 'Peek at the focused issue',
        when: (event) => focusedRowId(event) !== null,
        handler: (event) => peek(event),
      },
    ]),
  );
</script>

<IssuePeek
  issue={peeked}
  onClose={() => (peekId = null)}
  onOpen={(issue: IssueRow) => {
    peekId = null;
    onOpen(issue);
  }}
/>
