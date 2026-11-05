<script lang="ts">
  import { untrack } from 'svelte';
  import { Select as SelectPrimitive, type SelectMultipleRootProps, type SelectSingleRootProps } from 'bits-ui';

  // Radix Select is single-value with no `type`; keep that as the default and
  // allow bits' `type="multiple"`.
  type SingleProps = Omit<SelectSingleRootProps, 'type'> & {
    type?: 'single';
    /** Radix `defaultValue`: initial value when `value` is not passed (uncontrolled forms). */
    defaultValue?: string;
    /** Radix `defaultOpen`. */
    defaultOpen?: boolean;
  };
  type MultipleProps = SelectMultipleRootProps & {
    defaultValue?: string[];
    defaultOpen?: boolean;
  };
  type Props = SingleProps | MultipleProps;

  let {
    open = $bindable(),
    value = $bindable(),
    type = 'single',
    defaultValue,
    defaultOpen = false,
    ...restProps
  }: Props = $props();

  // Radix default* props only seed the initial state.
  if (open === undefined) open = untrack(() => defaultOpen);
  const initialValue = untrack(() => defaultValue);
  if (value === undefined && initialValue !== undefined) value = initialValue;
</script>

<!--
  `type` + `value` form a discriminated union that destructuring loses, so the
  bindings are cast (callers are still checked against Props).
-->
<SelectPrimitive.Root
  bind:open={open as never}
  bind:value={value as never}
  {...{ type, ...restProps } as SelectSingleRootProps}
/>
