#!/usr/bin/env bash
# svelte-check for the SvelteKit app, serialized (several builders share the
# machine; one check at a time) and filtered to the paths you pass.
#   scripts/kit-check.sh src/lib/components/issues src/routes/dashboard/my-issues
# No paths = whole report. Exit 1 when the filtered report has errors.
set -uo pipefail
cd "$(dirname "$0")/.."
LOCK="${KIT_CHECK_LOCK:-/tmp/ticket-system-kit-check.lock}"
OUT="$(mktemp)"
flock "$LOCK" bash -c 'npx svelte-kit sync >/dev/null 2>&1; npx svelte-check --tsconfig ./tsconfig.svelte.json --threshold error --output machine' >"$OUT" 2>&1
if [ "$#" -eq 0 ]; then
  grep -E ' ERROR ' "$OUT" | sed -E 's/^[0-9]+ ERROR //'
else
  # Paths are literal prefixes (route dirs contain [ ] which are regex syntax).
  grep -E ' ERROR ' "$OUT" | sed -E 's/^[0-9]+ ERROR //' | while IFS= read -r line; do
    for p in "$@"; do
      p="${p//\\/}"  # tolerate callers who escaped brackets
      case "$line" in "\"$p"*) printf '%s\n' "$line"; break ;; esac
    done
  done
fi > "$OUT.f"
cat "$OUT.f"
n=$(wc -l < "$OUT.f")
echo "kit-check: $n error(s) in ${*:-all files}"
rm -f "$OUT" "$OUT.f"
[ "$n" -eq 0 ]
