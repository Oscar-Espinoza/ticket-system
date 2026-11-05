import { CalendarDate, type DateValue } from "@internationalized/date"

/** react-day-picker matcher shapes (the subset of its `Matcher` type, all of them). */
export type DateBefore = { before: Date }
export type DateAfter = { after: Date }
export type DateInterval = { before: Date; after: Date }
export type DateRange = { from: Date | undefined; to?: Date | undefined }
export type DayOfWeek = { dayOfWeek: number | number[] }
export type Matcher =
  | boolean
  | ((date: Date) => boolean)
  | Date
  | Date[]
  | DateRange
  | DateBefore
  | DateAfter
  | DateInterval
  | DayOfWeek

/** Local calendar day of a JS Date (react-day-picker works in local time). */
export function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Local midnight of a DateValue, the same kind of Date react-day-picker hands out. */
export function toJsDate(value: DateValue): Date {
  return new Date(value.year, value.month - 1, value.day)
}

function dayNumber(date: Date): number {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  )
}

/** `differenceInCalendarDays(a, b)` from date-fns. */
function diffDays(a: Date, b: Date): number {
  return dayNumber(a) - dayNumber(b)
}

export function isSameDay(a: Date, b: Date): boolean {
  return diffDays(a, b) === 0
}

function rangeIncludesDate(range: DateRange, date: Date): boolean {
  let { from, to } = range
  if (from && to) {
    if (diffDays(to, from) < 0) [from, to] = [to, from]
    return diffDays(date, from) >= 0 && diffDays(to, date) >= 0
  }
  if (to) return isSameDay(to, date)
  if (from) return isSameDay(from, date)
  return false
}

function matches(date: Date, matcher: Matcher): boolean {
  if (typeof matcher === "boolean") return matcher
  if (typeof matcher === "function") return matcher(date)
  if (matcher instanceof Date) return isSameDay(date, matcher)
  if (Array.isArray(matcher)) return matcher.some((d) => isSameDay(date, d))
  if ("from" in matcher || "to" in matcher) return rangeIncludesDate(matcher as DateRange, date)
  if ("dayOfWeek" in matcher) {
    const days = Array.isArray(matcher.dayOfWeek) ? matcher.dayOfWeek : [matcher.dayOfWeek]
    return days.includes(date.getDay())
  }
  if ("before" in matcher && "after" in matcher) {
    const isDayBefore = diffDays(matcher.before, date) > 0
    const isDayAfter = diffDays(matcher.after, date) < 0
    const isClosedInterval = diffDays(matcher.before, matcher.after) > 0
    return isClosedInterval ? isDayAfter && isDayBefore : isDayBefore || isDayAfter
  }
  if ("before" in matcher) return diffDays(matcher.before, date) > 0
  if ("after" in matcher) return diffDays(date, matcher.after) > 0
  return false
}

/** react-day-picker's `dateMatchModifiers`: true when any matcher matches. */
export function dateMatches(date: Date, matchers: Matcher | Matcher[] | undefined): boolean {
  if (matchers === undefined) return false
  const list = Array.isArray(matchers) && !matchers.every((m) => m instanceof Date)
    ? (matchers as Matcher[])
    : [matchers as Matcher]
  return list.some((m) => matches(date, m))
}
