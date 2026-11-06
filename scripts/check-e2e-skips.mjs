// Fails when any Playwright test was skipped because the browser had no Web Audio API.
// Used in CI (Linux), where every browser has Web Audio, so a skip there means lost coverage.
//   node scripts/check-e2e-skips.mjs e2e-results.json
import { readFile } from 'node:fs/promises';

const REASON = 'No Web Audio API';
const file = process.argv[2] ?? 'e2e-results.json';

let report;
try {
  report = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  console.error(`Could not read the Playwright JSON report "${file}": ${e.message}`);
  process.exit(2);
}

/** Every test entry in the (nested) report, with its spec title. */
function* tests(suite, path = []) {
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests ?? []) yield { ...t, title: [...path, spec.title].join(' › ') };
  for (const child of suite.suites ?? [])
    yield* tests(child, [...path, child.title].filter(Boolean));
}

const all = (report.suites ?? []).flatMap((s) => [...tests(s, [s.title])]);
const skipped = all.filter((t) => t.status == 'skipped');
const noAudio = skipped.filter((t) =>
  (t.annotations ?? []).some((a) => a.type == 'skip' && a.description?.includes(REASON)),
);

const byProject = {};
for (const t of skipped) byProject[t.projectName] = (byProject[t.projectName] ?? 0) + 1;
console.log(`${all.length} tests, ${skipped.length} skipped`, byProject);

if (!all.length) {
  console.error('The report contains no tests.');
  process.exit(2);
}
if (noAudio.length) {
  console.error(`\n${noAudio.length} test(s) skipped because the browser had no Web Audio API:`);
  for (const t of noAudio) console.error(`  [${t.projectName}] ${t.title}`);
  console.error('\nThis job must run them. Check the runner and the Playwright browser build.');
  process.exit(1);
}
console.log('No tests were skipped for missing Web Audio.');
