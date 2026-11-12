// Fail when a vitest JSON report shows database suites that skipped
// themselves. CI runs the database suites with LOCAL_DB_TESTS=1 against a local
// service; a silent skip would make that job green while testing nothing.
// Usage: node scripts/assert-no-skips.mjs <report.json> [allowed-file-substring ...]
import { readFileSync } from 'node:fs';

const [, , report, ...allowed] = process.argv;
if (!report) {
  console.error('usage: node scripts/assert-no-skips.mjs <report.json> [allowed-file-substring ...]');
  process.exit(2);
}

const { testResults } = JSON.parse(readFileSync(report, 'utf8'));
const skippedByFile = new Map();
let passed = 0;
for (const file of testResults) {
  for (const test of file.assertionResults) {
    if (test.status === 'passed') passed++;
    else if (test.status === 'skipped' || test.status === 'pending' || test.status === 'todo') {
      skippedByFile.set(file.name, (skippedByFile.get(file.name) ?? 0) + 1);
    }
  }
}

const unexpected = [...skippedByFile].filter(([name]) => !allowed.some((part) => name.includes(part)));
if (passed === 0 || unexpected.length > 0) {
  if (passed === 0) console.error('::error::no database test passed');
  for (const [name, count] of unexpected) console.error(`::error::${count} test(s) skipped in ${name}`);
  process.exit(1);
}
console.log(`${passed} passed; skips only in: ${[...skippedByFile.keys()].join(', ') || 'none'}`);
