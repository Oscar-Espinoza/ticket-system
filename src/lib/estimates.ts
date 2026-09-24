// Estimate scales (project.estimate_scale). Values are stored as integers;
// t-shirt sizes map onto fibonacci-ish points so velocity math still works.

export type EstimateScale = 'none' | 'linear' | 'fibonacci' | 'exponential' | 'tshirt';

export interface EstimateOption {
  value: number;
  label: string;
}

export const ESTIMATE_SCALES: EstimateScale[] = [
  'none',
  'linear',
  'fibonacci',
  'exponential',
  'tshirt',
];

export const ESTIMATE_SCALE_LABEL: Record<EstimateScale, string> = {
  none: 'Not in use',
  linear: 'Linear (1, 2, 3, 4, 5)',
  fibonacci: 'Fibonacci (0, 1, 2, 3, 5, 8)',
  exponential: 'Exponential (1, 2, 4, 8, 16)',
  tshirt: 'T-shirt (XS, S, M, L, XL)',
};

const points = (values: number[]): EstimateOption[] =>
  values.map((value) => ({ value, label: String(value) }));

const OPTIONS: Record<EstimateScale, EstimateOption[]> = {
  none: [],
  linear: points([1, 2, 3, 4, 5]),
  fibonacci: points([0, 1, 2, 3, 5, 8]),
  exponential: points([1, 2, 4, 8, 16]),
  tshirt: [
    { value: 1, label: 'XS' },
    { value: 2, label: 'S' },
    { value: 3, label: 'M' },
    { value: 5, label: 'L' },
    { value: 8, label: 'XL' },
  ],
};

export function isEstimateScale(value: unknown): value is EstimateScale {
  return typeof value === 'string' && Object.hasOwn(OPTIONS, value);
}

/** Unknown scale strings (bad DB data) behave like "none". */
export function estimateOptions(scale: string): EstimateOption[] {
  return isEstimateScale(scale) ? OPTIONS[scale] : [];
}

export function isValidEstimate(scale: string, value: number): boolean {
  return estimateOptions(scale).some((option) => option.value === value);
}

/** "3", "M" — falls back to the raw number for values off the current scale. */
export function formatEstimate(scale: string, value: number | null): string {
  if (value === null) return '';
  return estimateOptions(scale).find((o) => o.value === value)?.label ?? String(value);
}
