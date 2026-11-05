<script lang="ts" module>
  import { focusOnMount } from "@/lib/svelte/focus"
  import type { Snippet } from "svelte"
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements"
  import type { WithElementRef } from "bits-ui"
  import type { ButtonSize, ButtonVariant } from "./button-variants"

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
      variant?: ButtonVariant | null
      size?: ButtonSize | null
      /** asChild replacement: render your own element and spread `props` onto it. */
      child?: Snippet<[{ props: Record<string, unknown> }]>
    }
</script>

<script lang="ts">
  import { cn } from "@/lib/utils"
  import { buttonVariants } from "./button-variants"

  let {
    class: className,
    variant = "default",
    size = "default",
    ref = $bindable(null),
    href = undefined,
    type,
    disabled,
    child,
    children,
    autofocus,
    ...restProps
  }: ButtonProps = $props()

  const classes = $derived(cn(buttonVariants({ variant, size }), className))
</script>

{#if child}
  {@render child({
    props: {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      class: classes,
      href,
      type,
      disabled,
      autofocus,
      ...restProps,
    },
  })}
{:else if href !== undefined}
  <!-- React: <Button asChild><Link href /></Button> — the Slot rendered the anchor with the button classes. -->
  <a
    bind:this={ref}
    data-slot="button"
    data-variant={variant}
    data-size={size}
    class={classes}
    href={disabled ? undefined : href}
    aria-disabled={disabled ? true : undefined}
    role={disabled ? "link" : undefined}
    tabindex={disabled ? -1 : undefined}
    {autofocus}
    {@attach autofocus ? focusOnMount : undefined}
    {...restProps}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    data-variant={variant}
    data-size={size}
    class={classes}
    {type}
    {disabled}
    {autofocus}
    {@attach autofocus ? focusOnMount : undefined}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
