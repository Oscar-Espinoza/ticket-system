# D5 — Cycle capacity / cooldown periods

## Goal
Leave an optional gap between cycles and show whether a cycle is planned
beyond the team's recent throughput.

## UX
- **Settings → Cycles & triage**: "Cooldown" select (No cooldown, 1–4 weeks):
  weeks between the end of one cycle and the start of the next. Changing it
  reschedules upcoming cycles (same notice as duration / start day).
- **Cycles list**: current card and upcoming rows show "scope / capacity"
  with an amber "Over capacity" warning. With no running cycle during a
  cooldown: "Cooldown — Cycle 5 starts in 3 days".
- **Cycle page** (current / upcoming): capacity block — bar of scope vs
  capacity, "Capacity ≈ 12 points · average completed in the last 3 cycles",
  warning when over. Hidden without completed past cycles.

## Data
- `cycleCapacity(pastTotals)` (client-safe, `cycle-utils.ts`): average
  completed issues and points over the last 3 past cycles → `{issues, points,
  sample}` | null. Unit = points when estimates are on and the average is > 0,
  else issues.
- Scheduling (`src/lib/cycles.ts`): period = duration + cooldown.
  `ensureUpcomingCycles(…, cooldownWeeks?)` reads `project.cycle_cooldown_weeks`
  when not passed (automation.ts keeps its call). Next cycle starts at last end
  + cooldown; skip-ahead lands on the next start when "now" is inside a
  cooldown. `rescheduleUpcomingCycles(…, cooldownWeeks)` lays upcoming cycles
  from the current end + cooldown (or respects a recent cycle's cooldown).
- `updatePlanningSettings` accepts `cooldownWeeks` 0–4.
- "New cycle" suggestion starts after last end + cooldown.

## Edge cases
Cooldown 0 = previous behaviour exactly. Past cycles with scope 0 still count
toward the average (a real zero-throughput cycle).
