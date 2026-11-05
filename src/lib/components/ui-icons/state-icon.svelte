<!-- A project's workflow state: its type's glyph in its own color, named for AT. -->
<script module lang="ts">
  import type { WorkflowState } from '@/lib/issue-model';

  import type { StatusIconProps } from './status-icon.svelte';

  export interface StateIconProps extends Omit<StatusIconProps, 'type' | 'color'> {
    state: Pick<WorkflowState, 'type' | 'color' | 'name'>;
  }
</script>

<script lang="ts">
  import StatusIcon from './status-icon.svelte';

  let { state, ...rest }: StateIconProps = $props();
</script>

<StatusIcon type={state.type} color={state.color} aria-label={state.name} {...rest} />
