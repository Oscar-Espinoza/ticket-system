<!--
  The issue list's
  side pane (desktop) / right sheet (below lg). `useIsDesktop` is re-exported
  from the module script.
-->
<script module lang="ts">
  export { useIsDesktop } from './use-is-desktop.svelte';
</script>

<script lang="ts">
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/lib/components/ui/sheet';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import IssueDetail from './issue-detail.svelte';
  import { useIsDesktop } from './use-is-desktop.svelte';

  let {
    issue,
    mutations,
    onClose,
  }: {
    issue: IssueRow;
    mutations: IssueMutations;
    onClose: () => void;
  } = $props();

  const desktop = useIsDesktop();

  // Desktop pane isn't a dialog, so Esc goes through the hotkey registry (which
  // already ignores it inside text fields and while a menu/dialog is open).
  $effect(() => {
    if (!desktop.current) return;
    return registerHotkeys([
      { key: 'Escape', scope: 'Issue', description: 'Close issue', handler: () => onClose() },
    ]);
  });
</script>

{#snippet detail()}
  {#key issue.id}
    <IssueDetail {issue} {mutations} variant="pane" {onClose} />
  {/key}
{/snippet}

{#if desktop.current}
  <aside
    aria-label={`Issue ${issue.key}`}
    data-issue-pane={issue.id}
    class="sticky top-0 ml-6 max-h-[calc(100vh-3.5rem)] w-[380px] shrink-0 self-start overflow-y-auto overflow-x-hidden border-l border-border pl-6"
  >
    {@render detail()}
  </aside>
{:else}
  <Sheet open onOpenChange={(open) => !open && onClose()}>
    <SheetContent
      side="right"
      showCloseButton={false}
      class="w-full overflow-y-auto overflow-x-hidden p-4 sm:max-w-md"
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <SheetTitle class="sr-only">{issue.key}</SheetTitle>
      <SheetDescription class="sr-only">{issue.title}</SheetDescription>
      {@render detail()}
    </SheetContent>
  </Sheet>
{/if}
