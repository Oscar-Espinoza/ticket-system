// Tiny shared pieces for the hand-rolled SVG charts: nice axis maxima, index-based hover
// (pointer + arrow keys), week / duration formatting. The visual parts are
//   chart-tooltip.svelte  (ChartTooltip, content as children)
//   series-key.svelte     (SeriesKey)
//   sr-table.svelte       (SrTable)
// `useChartWidth` is `<div bind:clientWidth={width}>` (render nothing while 0).

/** 1, 2, 5 × 10ⁿ ceiling, so gridlines land on round numbers. */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * Nearest data index under the pointer; arrow keys move it when focused.
 * `count` is a getter (the data can change). Spread `hover.handlers` on the
 * focusable <svg>: pointer move/leave, ←/→, focus, blur and tabindex=0.
 */
export class IndexHover {
  index = $state<number | null>(null);
  #count: () => number;
  #indexAt: (x: number) => number;

  constructor(count: () => number, indexAt: (x: number) => number) {
    this.#count = count;
    this.#indexAt = indexAt;
  }

  handlers = {
    onpointermove: (e: PointerEvent & { currentTarget: EventTarget & SVGElement }) => {
      const rect = e.currentTarget.getBoundingClientRect();
      this.index = Math.max(0, Math.min(this.#count() - 1, this.#indexAt(e.clientX - rect.left)));
    },
    onpointerleave: () => {
      this.index = null;
    },
    onkeydown: (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const count = this.#count();
      const current = this.index ?? (e.key === 'ArrowLeft' ? count : -1);
      this.index = Math.max(0, Math.min(count - 1, current + (e.key === 'ArrowLeft' ? -1 : 1)));
    },
    onfocus: () => {
      this.index = this.index ?? this.#count() - 1;
    },
    onblur: () => {
      this.index = null;
    },
    tabindex: 0,
  };
}

export function useIndexHover(count: () => number, indexAt: (x: number) => number): IndexHover {
  return new IndexHover(count, indexAt);
}

const weekFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Mar 4" for a YYYY-MM-DD week start. */
export function formatWeek(week: string): string {
  return weekFormat.format(new Date(`${week}T00:00:00Z`));
}

/** 5h · 2.5d · 3.1w */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h`;
  const days = hours / 24;
  if (days < 14) return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
  return `${(days / 7).toFixed(1)}w`;
}
