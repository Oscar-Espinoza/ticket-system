/**
 * Calendar (react-day-picker → bits-ui Calendar).
 *
 * Callers keep the react-day-picker contract and keep passing / receiving JS `Date`s
 * (local midnight; conversion to @internationalized/date happens inside):
 *   <Calendar mode="single" selected={date} defaultMonth={date} autoFocus
 *     disabled={{ before: firstDay }} onSelect={(d) => d && pick(d)} class="mx-auto" />
 * - `mode`: "single" (`selected?: Date`, `onSelect(date | undefined, triggerDate)`) or
 *   "multiple" (`selected?: Date[]`, `onSelect(dates, triggerDate)`, `min`, `max`).
 * - Like react-day-picker, passing `onSelect` makes the selection controlled by `selected`
 *   (re-pass the new value to show it); without `onSelect`, Calendar keeps its own
 *   selection and writes it back through `bind:selected`. Clicking the selected day
 *   calls `onSelect(undefined)` unless `required`.
 * - Month: `defaultMonth` (initial), or `month` + `onMonthChange` (controlled);
 *   `startMonth` / `endMonth` limit navigation (and the year dropdown).
 * - `disabled` / `hidden` take react-day-picker matchers: `Date`, `Date[]`, `{ before }`,
 *   `{ after }`, `{ before, after }`, `{ from, to }`, `{ dayOfWeek }`, `(date) => boolean`,
 *   `boolean`, or an array of them.
 * - Also: `showOutsideDays` (default true), `captionLayout` ("label" | "dropdown" |
 *   "dropdown-months" | "dropdown-years"), `buttonVariant` (default "ghost"), `today`,
 *   `required`, `weekStartsOn`, `fixedWeeks`, `numberOfMonths`, `pagedNavigation`,
 *   `disableNavigation`, `hideNavigation`, `hideWeekdays`, `classNames` (same keys as
 *   react-day-picker, replacing the default for that key), `class`, `bind:ref`.
 * - `locale` is a BCP 47 string (default "en-US"), not a date-fns Locale object.
 * - CalendarDayButton: `{ day: Date, modifiers, locale? }` + button attributes; Calendar
 *   renders it inside bits-ui's `Calendar.Day` child snippet.
 */
import Calendar, {
  type CalendarClassNames,
  type CalendarMultipleProps,
  type CalendarProps,
  type CalendarSingleProps,
} from "./calendar.svelte"
import CalendarDayButton, {
  type CalendarDayButtonProps,
  type CalendarDayModifiers,
} from "./calendar-day-button.svelte"
import type { Matcher } from "./calendar-utils"

export {
  Calendar,
  CalendarDayButton,
  type CalendarClassNames,
  type CalendarDayButtonProps,
  type CalendarDayModifiers,
  type CalendarMultipleProps,
  type CalendarProps,
  type CalendarSingleProps,
  type Matcher,
}
