<!--
  Pick another issue by key or title (popover). Shared: parent, sub-issues and
  relations use it; other features can too (pass any list of the project's issues).
  The trigger is the `children` snippet (asChild): spread its `props`.
-->
<script module lang="ts">
  export type { IssueRef, IssueSearchOptionsProps } from './issue-search-options.svelte';
</script>

<script lang="ts" generics="T extends IssueRef">
  import PickerPopover, { type PickerPopoverProps } from '@/lib/components/issue-pickers/picker-popover.svelte';
  import IssueSearchOptions, { type IssueRef, type IssueSearchOptionsProps } from './issue-search-options.svelte';

  let {
    onSelect,
    onClear,
    issues,
    exclude,
    value,
    clearLabel,
    placeholder,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & IssueSearchOptionsProps<T> = $props();
</script>

<PickerPopover {...popover} bind:open class="w-80">
  {#snippet content(close)}
    <IssueSearchOptions
      {issues}
      {exclude}
      {value}
      {clearLabel}
      {placeholder}
      onSelect={(issue) => {
        close();
        onSelect(issue);
      }}
      onClear={onClear &&
        (() => {
          close();
          onClear();
        })}
    />
  {/snippet}
</PickerPopover>
