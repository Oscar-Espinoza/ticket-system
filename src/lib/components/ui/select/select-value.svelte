<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';

  type Props = SelectPrimitive.ValueProps & {
    /** Shown while no value is selected (Radix `placeholder`). */
    placeholder?: string;
  };

  let { ref = $bindable(null), ...restProps }: Props = $props();
</script>

<SelectPrimitive.Value bind:ref data-slot="select-value" {...restProps} />
