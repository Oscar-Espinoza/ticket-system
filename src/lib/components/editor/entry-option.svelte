<!-- One suggestion row. -->
<script lang="ts">
  import { StateIcon } from '@/lib/components/ui-icons';
  import MemberOption from './member-option.svelte';
  import { optionClass, type SuggestionEntry } from './suggestion-entries';

  let {
    id,
    active,
    onPick,
    onHover,
    entry,
  }: {
    id: string;
    active: boolean;
    onPick: () => void;
    onHover: () => void;
    entry: SuggestionEntry;
  } = $props();

  // mousedown + preventDefault: pick without blurring the editor.
  function onmousedown(e: MouseEvent) {
    e.preventDefault();
    onPick();
  }
</script>

{#if entry.type === 'member'}
  <MemberOption member={entry.member} {id} {active} {onPick} {onHover} />
{:else if entry.type === 'issue'}
  {@const issue = entry.issue}
  <li {id} role="option" aria-selected={active} class={optionClass(active)} {onmousedown} onmousemove={onHover}>
    {#if issue.state}
      <StateIcon state={issue.state} class="size-3.5 shrink-0" />
    {:else}
      <span class="size-3.5 shrink-0"></span>
    {/if}
    <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{issue.key}</span>
    <span class="truncate">{issue.title}</span>
  </li>
{:else}
  {@const command = entry.command}
  {@const Icon = command.icon}
  <li {id} role="option" aria-selected={active} class={optionClass(active)} {onmousedown} onmousemove={onHover}>
    <span
      class="flex size-6 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground [&_svg]:size-3.5"
    >
      <Icon aria-hidden="true" />
    </span>
    <span class="flex-1 truncate">{command.label}</span>
    {#if command.hint}
      <kbd class="font-mono text-[11px] text-muted-foreground">{command.hint}</kbd>
    {/if}
  </li>
{/if}
