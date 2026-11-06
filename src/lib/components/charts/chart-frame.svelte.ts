// Shared pieces of the hand-rolled SVG charts:
// plot margins, a nice linear y scale, evenly spaced tick indexes and the
// hovered / keyboard-focused data index. The visual parts live in
//   chart-tooltip.svelte, swatch.svelte, chart-legend.svelte, chart-table.svelte, y-axis.svelte.
//
// `useChartWidth` has no equivalent here: measure the wrapper with
//   <div bind:clientWidth={width}> and render nothing while `width === 0`.
//
// `useActiveIndex(count, indexAt)` takes `count` as a GETTER (the data can change)
// and returns an object whose members are plain handlers:
//   const hover = useActiveIndex(() => bars.length, (px) => …);
//   hover.active                       reactive `number | null`
//   hover.setActive(i)
//   <rect onpointermove={hover.onpointermove} onpointerleave={hover.onpointerleave} …/>
//   <div onkeydown={hover.onkeydown} onblur={hover.onblur} …/>

export const CHART_MARGIN = { top: 8, right: 8, bottom: 22, left: 32 };

export type SwatchKind = 'line' | 'dashed' | 'area' | 'bar';

/** A rounded max and 3–5 evenly spaced ticks from 0. */
export function niceScale(max: number): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const niceStep = step < 1 && max >= 1 ? 1 : step;
  const top = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= top + niceStep / 2; v += niceStep) ticks.push(Number(v.toFixed(6)));
  return { max: top, ticks };
}

/** Pick up to `max` evenly spaced indexes (always the first and last). */
export function tickIndexes(count: number, max = 6): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

/**
 * The hovered / keyboard-focused data index. Pointer x → nearest index via
 * `indexAt`; ←/→ step, Home/End jump, Esc clears.
 */
export class ActiveIndex {
  active = $state<number | null>(null);
  #count: () => number;
  #indexAt: (x: number) => number;

  constructor(count: () => number, indexAt: (x: number) => number) {
    this.#count = count;
    this.#indexAt = indexAt;
  }

  setActive = (index: number | null) => {
    this.active = index;
  };

  onpointermove = (event: PointerEvent & { currentTarget: EventTarget & SVGElement }) => {
    const box = event.currentTarget.getBoundingClientRect();
    this.active = this.#indexAt(event.clientX - box.left);
  };

  onpointerleave = () => {
    this.active = null;
  };

  onblur = () => {
    this.active = null;
  };

  onkeydown = (event: KeyboardEvent) => {
    const count = this.#count();
    if (count === 0) return;
    const active = this.active;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = Math.min(count - 1, (active ?? -1) + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, (active ?? count) - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else if (event.key === 'Escape') {
      this.active = null;
      return;
    } else return;
    event.preventDefault();
    this.active = next;
  };
}

export function useActiveIndex(count: () => number, indexAt: (x: number) => number): ActiveIndex {
  return new ActiveIndex(count, indexAt);
}
