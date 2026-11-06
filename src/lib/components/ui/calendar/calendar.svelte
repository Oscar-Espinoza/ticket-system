<script lang="ts" module>
  import type { HTMLAttributes } from "svelte/elements"
  import type { ButtonVariant } from "@/lib/components/ui/button"
  import type { Matcher } from "./calendar-utils"

  /** react-day-picker class-name keys the Calendar styles (plus the ones it left default). */
  export type CalendarClassNames = Partial<
    Record<
      | "root"
      | "months"
      | "month"
      | "nav"
      | "button_previous"
      | "button_next"
      | "month_caption"
      | "dropdowns"
      | "dropdown_root"
      | "dropdown"
      | "caption_label"
      | "month_grid"
      | "weekdays"
      | "weekday"
      | "weeks"
      | "week"
      | "day"
      | "day_button"
      | "today"
      | "outside"
      | "disabled"
      | "hidden"
      | "selected"
      | "chevron",
      string
    >
  >

  type CalendarBaseProps = Omit<
    HTMLAttributes<HTMLDivElement>,
    "class" | "children" | "onselect" | "hidden"
  > & {
    ref?: HTMLElement | null
    class?: string
    classNames?: CalendarClassNames
    /** Show the leading/trailing days of neighbouring months (default true). */
    showOutsideDays?: boolean
    captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years"
    buttonVariant?: ButtonVariant
    /** BCP 47 tag (react-day-picker took a date-fns Locale object). Default "en-US". */
    locale?: string
    /** Initially displayed month (uncontrolled). */
    defaultMonth?: Date
    /** Displayed month (controlled, with onMonthChange). */
    month?: Date
    onMonthChange?: (month: Date) => void
    /** First / last month the user can navigate to. */
    startMonth?: Date
    endMonth?: Date
    disabled?: Matcher | Matcher[]
    hidden?: Matcher | Matcher[]
    /** Defaults to the current date. */
    today?: Date
    /** Selection cannot be emptied. */
    required?: boolean
    /** Focus the selected day (or today / the first day) on mount. */
    autoFocus?: boolean
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
    fixedWeeks?: boolean
    numberOfMonths?: number
    pagedNavigation?: boolean
    disableNavigation?: boolean
    hideNavigation?: boolean
    hideWeekdays?: boolean
  }

  export type CalendarSingleProps = CalendarBaseProps & {
    mode: "single"
    selected?: Date
    onSelect?: (selected: Date | undefined, triggerDate: Date) => void
  }

  export type CalendarMultipleProps = CalendarBaseProps & {
    mode: "multiple"
    selected?: Date[]
    onSelect?: (selected: Date[] | undefined, triggerDate: Date) => void
    min?: number
    max?: number
  }

  export type CalendarProps = CalendarSingleProps | CalendarMultipleProps
</script>

<script lang="ts">
  import { Calendar as CalendarPrimitive } from "bits-ui"
  import { CalendarDate, type DateValue } from "@internationalized/date"
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left"
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right"
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down"
  import { cn } from "@/lib/utils"
  import { buttonVariants } from "@/lib/components/ui/button"
  import CalendarDayButton, { type CalendarDayModifiers } from "./calendar-day-button.svelte"
  import { dateMatches, isSameDay, toCalendarDate, toJsDate } from "./calendar-utils"

  let {
    ref = $bindable(null),
    mode,
    selected = $bindable(),
    onSelect,
    required = false,
    month,
    defaultMonth,
    onMonthChange,
    startMonth,
    endMonth,
    disabled,
    hidden,
    today: todayProp,
    showOutsideDays = true,
    captionLayout = "label",
    buttonVariant = "ghost",
    locale = "en-US",
    weekStartsOn,
    fixedWeeks = false,
    numberOfMonths = 1,
    pagedNavigation = false,
    autoFocus = false,
    disableNavigation = false,
    hideNavigation = false,
    hideWeekdays = false,
    class: className,
    classNames,
    ...restProps
  }: CalendarProps = $props()

  // `min` / `max` only exist in multiple mode.
  const min = $derived((restProps as { min?: number }).min)
  const max = $derived((restProps as { max?: number }).max)
  const rootAttrs = $derived.by(() => {
    const { min: _min, max: _max, ...attrs } = restProps as Record<string, unknown>
    return attrs
  })

  const today = $derived(todayProp ?? new Date())

  // ---- class names (react-day-picker defaults + the overrides) ----
  const c = $derived({
    root: cn("w-fit", "rdp-root"),
    months: cn("relative flex flex-col gap-4 md:flex-row", "rdp-months"),
    month: cn("flex w-full flex-col gap-4", "rdp-month"),
    nav: cn(
      "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
      "rdp-nav"
    ),
    button_previous: cn(
      buttonVariants({ variant: buttonVariant }),
      "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
      "rdp-button_previous"
    ),
    button_next: cn(
      buttonVariants({ variant: buttonVariant }),
      "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
      "rdp-button_next"
    ),
    month_caption: cn(
      "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
      "rdp-month_caption"
    ),
    dropdowns: cn(
      "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
      "rdp-dropdowns"
    ),
    dropdown_root: cn("relative rounded-(--cell-radius)", "rdp-dropdown_root"),
    dropdown: cn("absolute inset-0 bg-popover opacity-0", "rdp-dropdown"),
    caption_label: cn(
      "font-medium select-none",
      captionLayout === "label"
        ? "text-sm"
        : "flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
      "rdp-caption_label"
    ),
    month_grid: cn("w-full border-collapse", "rdp-month_grid"),
    weekdays: cn("flex", "rdp-weekdays"),
    weekday: cn(
      "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
      "rdp-weekday"
    ),
    weeks: "rdp-weeks",
    week: cn("mt-2 flex w-full", "rdp-week"),
    // react-day-picker's `data-selected="true"` → bits-ui's presence attribute `data-selected`.
    day: cn(
      "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected]_button]:rounded-r-(--cell-radius)",
      "[&:first-child[data-selected]_button]:rounded-l-(--cell-radius)",
      "rdp-day"
    ),
    day_button: "rdp-day_button",
    today: cn(
      "rounded-(--cell-radius) bg-muted text-foreground data-selected:rounded-none",
      "rdp-today"
    ),
    outside: cn("text-muted-foreground aria-selected:text-muted-foreground", "rdp-outside"),
    disabled: cn("text-muted-foreground opacity-50", "rdp-disabled"),
    hidden: cn("invisible", "rdp-hidden"),
    selected: "rdp-selected",
    chevron: "rdp-chevron",
    ...classNames,
  })

  // ---- navigation range (react-day-picker getNavMonths) ----
  const hasYearDropdown = $derived(captionLayout === "dropdown" || captionLayout === "dropdown-years")
  const navStart = $derived.by(() => {
    if (startMonth) return new CalendarDate(startMonth.getFullYear(), startMonth.getMonth() + 1, 1)
    if (hasYearDropdown) return new CalendarDate(today.getFullYear() - 100, 1, 1)
    return undefined
  })
  const navEnd = $derived.by(() => {
    if (endMonth) {
      const first = new CalendarDate(endMonth.getFullYear(), endMonth.getMonth() + 1, 1)
      return first.set({ day: first.calendar.getDaysInMonth(first) })
    }
    if (hasYearDropdown) return new CalendarDate(today.getFullYear(), 12, 31)
    return undefined
  })

  // ---- selection: Date / Date[] in, Date / Date[] out ----
  const selectedDates = $derived<Date[]>(
    mode === "multiple"
      ? Array.isArray(selected)
        ? selected
        : []
      : selected instanceof Date
        ? [selected]
        : []
  )

  const value = $derived.by(() => {
    if (mode === "multiple") return selectedDates.map(toCalendarDate)
    return selectedDates[0] ? toCalendarDate(selectedDates[0]) : undefined
  })

  /**
   * react-day-picker semantics: with `onSelect` the selection is controlled by `selected`
   * (the caller decides whether to accept the change); without it, Calendar keeps its own
   * selection (written back through `bind:selected`).
   */
  function commit(next: Date | Date[] | undefined, triggerDate: Date) {
    if (onSelect) {
      ;(onSelect as (selected: Date | Date[] | undefined, triggerDate: Date) => void)(
        next,
        triggerDate
      )
    } else {
      selected = next as never
    }
  }

  function setValue(next: DateValue | DateValue[] | undefined) {
    if (mode === "multiple") {
      const prev = selectedDates
      const nextDates = ((next as DateValue[] | undefined) ?? []).map(toJsDate)
      const added = nextDates.find((d) => !prev.some((p) => isSameDay(p, d)))
      const removed = prev.find((p) => !nextDates.some((d) => isSameDay(p, d)))
      if (added) {
        commit(max !== undefined && prev.length === max ? [added] : [...prev, added], added)
      } else if (removed) {
        if (min !== undefined && prev.length === min) return
        if (required && prev.length === 1) return
        commit(
          prev.filter((p) => !isSameDay(p, removed)),
          removed
        )
      }
      return
    }
    const prev = selectedDates[0]
    const nextDate = next && !Array.isArray(next) ? toJsDate(next) : undefined
    const triggerDate = nextDate ?? prev
    if (!triggerDate) return
    commit(nextDate, triggerDate)
  }

  // ---- displayed month (bits-ui placeholder) ----
  // svelte-ignore state_referenced_locally
  let internalPlaceholder = $state<DateValue>(toCalendarDate(month ?? defaultMonth ?? today))

  const placeholder = $derived.by(() => {
    if (
      month &&
      (month.getFullYear() !== internalPlaceholder.year ||
        month.getMonth() + 1 !== internalPlaceholder.month)
    ) {
      return toCalendarDate(month)
    }
    return internalPlaceholder
  })

  function clampToNav(date: DateValue): DateValue {
    if (navStart && date.compare(navStart) < 0) return navStart
    if (navEnd && date.compare(navEnd) > 0) return navEnd.set({ day: 1 })
    return date
  }

  function setPlaceholder(next: DateValue) {
    const prev = placeholder
    internalPlaceholder = next
    if (prev.year !== next.year || prev.month !== next.month) {
      onMonthChange?.(new Date(next.year, next.month - 1, 1))
    }
  }

  function goToMonth(next: DateValue) {
    if (disableNavigation) return
    setPlaceholder(clampToNav(next.set({ day: 1 })))
  }

  // ---- modifiers ----
  function isDisabledDate(date: DateValue): boolean {
    return dateMatches(toJsDate(date), disabled) || dateMatches(toJsDate(date), hidden)
  }

  function modifiersFor(date: DateValue, displayMonth: DateValue): CalendarDayModifiers {
    const jsDate = toJsDate(date)
    const outside = date.month !== displayMonth.month || date.year !== displayMonth.year
    const beforeNav = navStart !== undefined && date.compare(navStart) < 0
    const afterNav = navEnd !== undefined && date.compare(navEnd) > 0
    return {
      outside,
      hidden: (outside && !showOutsideDays) || dateMatches(jsDate, hidden),
      disabled: dateMatches(jsDate, disabled) || beforeNav || afterNav,
      today: isSameDay(jsDate, today),
      selected: selectedDates.some((d) => isSameDay(d, jsDate)),
    }
  }

  function dayClass(m: CalendarDayModifiers): string {
    // react-day-picker joins modifier class names without merging them.
    return [
      c.day,
      m.outside && c.outside,
      m.disabled && c.disabled,
      m.hidden && c.hidden,
      m.today && c.today,
      m.selected && c.selected,
    ]
      .filter(Boolean)
      .join(" ")
  }

  // ---- autoFocus ----
  // bits-ui's `initialFocus` queries the first `[data-focused]` node, which is the <td>
  // (not focusable), so focus the roving-tabindex day button ourselves — the same day
  // react-day-picker's autoFocus picks (selected / today / first enabled day).
  $effect(() => {
    if (!autoFocus || !ref) return
    const day =
      ref.querySelector<HTMLElement>("[data-bits-day][tabindex='0']") ??
      ref.querySelector<HTMLElement>("[data-bits-day][data-focused]")
    day?.focus()
  })

  // ---- captions / dropdowns ----
  function formatCaption(date: DateValue): string {
    return toJsDate(date).toLocaleDateString(locale, { month: "long", year: "numeric" })
  }

  function formatMonthDropdown(date: DateValue): string {
    return toJsDate(date).toLocaleString(locale, { month: "short" })
  }

  function monthOptions(displayMonth: DateValue) {
    return Array.from({ length: 12 }, (_, i) => {
      const option = new CalendarDate(displayMonth.year, i + 1, 1)
      const isDisabled =
        (navStart !== undefined && option.compare(navStart.set({ day: 1 })) < 0) ||
        (navEnd !== undefined && option.compare(navEnd.set({ day: 1 })) > 0)
      return { value: i + 1, label: formatMonthDropdown(option), disabled: isDisabled }
    })
  }

  const yearOptions = $derived.by(() => {
    if (!navStart || !navEnd) return []
    const years: { value: number; label: string }[] = []
    for (let y = navStart.year; y <= navEnd.year; y++) years.push({ value: y, label: String(y) })
    return years
  })

  function onMonthSelect(displayMonth: DateValue, displayIndex: number, value: number) {
    goToMonth(displayMonth.set({ month: value, day: 1 }).subtract({ months: displayIndex }))
  }

  function onYearSelect(displayMonth: DateValue, displayIndex: number, value: number) {
    goToMonth(displayMonth.set({ year: value, day: 1 }).subtract({ months: displayIndex }))
  }
</script>

<CalendarPrimitive.Root
  bind:ref
  type={mode as "single"}
  bind:value={() => value as never, (v) => setValue(v)}
  bind:placeholder={() => placeholder, setPlaceholder}
  {locale}
  {weekStartsOn}
  {fixedWeeks}
  {numberOfMonths}
  {pagedNavigation}
  weekdayFormat="short"
  preventDeselect={required}
  minValue={navStart}
  maxValue={navEnd}
  isDateDisabled={isDisabledDate}
  disableDaysOutsideMonth={!showOutsideDays}
  data-slot="calendar"
  class={cn(
    c.root,
    "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
    String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
    String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
    className
  )}
  {...rootAttrs}
>
  {#snippet children({ months, weekdays })}
    <div class={c.months}>
      {#if !hideNavigation}
        <nav class={c.nav} aria-label="Navigation bar">
          <CalendarPrimitive.PrevButton>
            {#snippet child({ props })}
              <button
                {...props}
                aria-label="Go to the Previous Month"
                disabled={(props.disabled as boolean | undefined) || disableNavigation}
                class={c.button_previous}
              >
                <ChevronLeftIcon class={cn("size-4", c.chevron)} />
              </button>
            {/snippet}
          </CalendarPrimitive.PrevButton>
          <CalendarPrimitive.NextButton>
            {#snippet child({ props })}
              <button
                {...props}
                aria-label="Go to the Next Month"
                disabled={(props.disabled as boolean | undefined) || disableNavigation}
                class={c.button_next}
              >
                <ChevronRightIcon class={cn("size-4", c.chevron)} />
              </button>
            {/snippet}
          </CalendarPrimitive.NextButton>
        </nav>
      {/if}
      {#each months as displayMonth, displayIndex (displayMonth.value.toString())}
        <div class={c.month}>
          <div class={c.month_caption}>
            {#if captionLayout === "label"}
              <span class={c.caption_label} role="status" aria-live="polite">
                {formatCaption(displayMonth.value)}
              </span>
            {:else}
              <div class={c.dropdowns}>
                {#if captionLayout === "dropdown" || captionLayout === "dropdown-months"}
                  {@const options = monthOptions(displayMonth.value)}
                  <span class={c.dropdown_root} data-disabled={disableNavigation || undefined}>
                    <select
                      class={[c.dropdown, "rdp-months_dropdown"].join(" ")}
                      aria-label="Choose the Month"
                      disabled={disableNavigation}
                      value={displayMonth.value.month}
                      onchange={(e) =>
                        onMonthSelect(displayMonth.value, displayIndex, Number(e.currentTarget.value))}
                    >
                      {#each options as option (option.value)}
                        <option value={option.value} disabled={option.disabled}>{option.label}</option>
                      {/each}
                    </select>
                    <span class={c.caption_label} aria-hidden="true">
                      {options.find((o) => o.value === displayMonth.value.month)?.label}
                      <ChevronDownIcon class={cn("size-4", c.chevron)} />
                    </span>
                  </span>
                {:else}
                  <span>{formatMonthDropdown(displayMonth.value)}</span>
                {/if}
                {#if captionLayout === "dropdown" || captionLayout === "dropdown-years"}
                  <span class={c.dropdown_root} data-disabled={disableNavigation || undefined}>
                    <select
                      class={[c.dropdown, "rdp-years_dropdown"].join(" ")}
                      aria-label="Choose the Year"
                      disabled={disableNavigation}
                      value={displayMonth.value.year}
                      onchange={(e) =>
                        onYearSelect(displayMonth.value, displayIndex, Number(e.currentTarget.value))}
                    >
                      {#each yearOptions as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                    <span class={c.caption_label} aria-hidden="true">
                      {displayMonth.value.year}
                      <ChevronDownIcon class={cn("size-4", c.chevron)} />
                    </span>
                  </span>
                {:else}
                  <span>{displayMonth.value.year}</span>
                {/if}
                <span class="sr-only" role="status" aria-live="polite">
                  {formatCaption(displayMonth.value)}
                </span>
              </div>
            {/if}
          </div>
          <CalendarPrimitive.Grid
            class={c.month_grid}
            aria-label={formatCaption(displayMonth.value)}
            aria-multiselectable={mode === "multiple"}
          >
            {#if !hideWeekdays}
              <CalendarPrimitive.GridHead>
                <CalendarPrimitive.GridRow class={c.weekdays}>
                  {#each weekdays as weekday, i (i)}
                    <CalendarPrimitive.HeadCell class={c.weekday} scope="col">
                      {weekday.slice(0, 2)}
                    </CalendarPrimitive.HeadCell>
                  {/each}
                </CalendarPrimitive.GridRow>
              </CalendarPrimitive.GridHead>
            {/if}
            <CalendarPrimitive.GridBody class={c.weeks}>
              {#each displayMonth.weeks as weekDates, w (w)}
                <CalendarPrimitive.GridRow class={c.week}>
                  {#each weekDates as date (date.toString())}
                    {@const m = modifiersFor(date, displayMonth.value)}
                    <CalendarPrimitive.Cell
                      {date}
                      month={displayMonth.value}
                      class={dayClass(m)}
                      data-day={date.toString()}
                      data-hidden={m.hidden || undefined}
                    >
                      {#if !m.hidden}
                        <CalendarPrimitive.Day>
                          {#snippet child({ props })}
                            <CalendarDayButton
                              {...props}
                              day={toJsDate(date)}
                              modifiers={m}
                              {locale}
                              disabled={m.disabled || undefined}
                              class={c.day_button}
                            >
                              {date.day}
                            </CalendarDayButton>
                          {/snippet}
                        </CalendarPrimitive.Day>
                      {/if}
                    </CalendarPrimitive.Cell>
                  {/each}
                </CalendarPrimitive.GridRow>
              {/each}
            </CalendarPrimitive.GridBody>
          </CalendarPrimitive.Grid>
        </div>
      {/each}
    </div>
  {/snippet}
</CalendarPrimitive.Root>
