# A1 — Estimates

## Goal
Points per issue on the project's scale.

## UX
Scales: none (hidden everywhere) · linear 1–5 · fibonacci 0,1,2,3,5,8 ·
exponential 1,2,4,8,16 · t-shirt XS/S/M/L/XL (stored 1,2,3,5,8). Estimate chip
on rows/cards when set; `EstimatePicker` in detail + new-issue.

## Data
`ticket.estimate` int, `project.estimate_scale`. `lib/estimates.ts`:
`estimateOptions(scale)`, `formatEstimate(scale, value)`,
`isValidEstimate(scale, value)`. Server rejects values outside the scale (and
any value when the scale is none). Scale setting UI is B7's (planning settings).
