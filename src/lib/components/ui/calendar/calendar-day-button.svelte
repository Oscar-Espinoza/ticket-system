<script lang="ts" module>
  import type { ButtonProps } from "@/lib/components/ui/button"

  /** react-day-picker's day modifiers, as CalendarDayButton receives them. */
  export type CalendarDayModifiers = {
    selected?: boolean
    today?: boolean
    outside?: boolean
    disabled?: boolean
    hidden?: boolean
    focused?: boolean
    range_start?: boolean
    range_end?: boolean
    range_middle?: boolean
  }

  export type CalendarDayButtonProps = Omit<ButtonProps, "href" | "child"> & {
    day: Date
    modifiers: CalendarDayModifiers
    locale?: string
  }
</script>

<script lang="ts">
  import { cn } from "@/lib/utils"
  import { Button } from "@/lib/components/ui/button"

  let {
    ref = $bindable(null),
    class: className,
    day,
    modifiers,
    locale,
    children,
    ...restProps
  }: CalendarDayButtonProps = $props()
</script>

<!--
  react-day-picker set `data-focused="true"` on the cell while the day button had DOM focus;
  bits-ui's `data-focused` marks the roving-tabindex date instead, so the focus ring classes
  `group-data-[focused=true]/day:*` are expressed as `focus:*` on the button itself.
-->
<Button
  bind:ref
  variant="ghost"
  size="icon"
  type="button"
  data-day={day.toLocaleDateString(locale)}
  data-selected-single={!!modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle}
  data-range-start={!!modifiers.range_start}
  data-range-end={!!modifiers.range_end}
  data-range-middle={!!modifiers.range_middle}
  class={cn(
    "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal focus:relative focus:z-10 focus:border-ring focus:ring-[3px] focus:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70",
    "rdp-day",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</Button>
