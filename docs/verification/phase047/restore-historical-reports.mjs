// Recover the exact pre-phase report bytes, guarded by the recorded SHA-256s.
// The final rerun refreshed the historical files after temporary backup cleanup.
// The JSON is already archived byte-for-byte in Phase 4.5; its Markdown is the
// unchanged generation-sample test's deterministic presentation of that JSON.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../../', import.meta.url);
const path = relative => new URL(relative, base);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const preserved = JSON.parse(await readFile(new URL('PRESERVATION.json',import.meta.url),'utf8'));
const expected = relative => preserved.find(row=>row.path.replaceAll('\\','/')===relative).beforeSha256;
const original = await readFile(path('verification/PHASE_04_5_SEED_REGRESSION.json'));
const report = JSON.parse(original);
const summaries = report.profiles;
const lines = [
  '# Phase 03 deterministic seed sample', '',
  `Runtime: ${report.runtime}; OS: ${report.platform}; CPU: ${report.cpu}.`, '',
  report.note, '', `Cases: ${report.totalCases}; generated: ${report.generated}; fully verified: ${report.verified}.`, '',
  '| Requested profile | Seeds | Verified | Mean score | Mean arrows | Mean density | Mean chain | Mean ms | p95 ms | Max ms | Tier matches |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...summaries.map(row=>`| ${row.profile} | ${row.seedRange.join('–')} | ${row.verified}/${row.cases} | ${row.meanScore.toFixed(2)} | ${row.meanArrows.toFixed(2)} | ${(row.meanDensity*100).toFixed(1)}% | ${row.meanChain.toFixed(2)} | ${row.meanGenerationMs.toFixed(2)} | ${row.p95GenerationMs.toFixed(2)} | ${row.maxGenerationMs.toFixed(2)} | ${row.matchedRequested}/${row.generated} |`), '',
  'The JSON report includes actual tier distributions, layout diversity, choice/bend/dependency metrics, rejection totals and explicit failure seeds. Timing varies with CPU load and JIT warmup.', '',
];
const markdown=Buffer.from(lines.join('\n'));
if(hash(original)!==expected('docs/verification/PHASE_03_SEED_SAMPLE.json')||hash(markdown)!==expected('docs/PHASE_03_SEED_SAMPLE.md'))throw new Error('Recovery does not match the original checkpoint; no historical file written.');
for(const [relative,bytes,archive] of [
  ['verification/PHASE_03_SEED_SAMPLE.json',original,'V1_SEED_REGRESSION.json'],
  ['PHASE_03_SEED_SAMPLE.md',markdown,'V1_SEED_REGRESSION.md'],
]){
  const current=await readFile(path(relative));
  if(hash(current)!==hash(bytes)){
    await writeFile(new URL(archive,import.meta.url),current);
    await writeFile(path(relative),bytes);
  }
}
console.log('Both historical reports restored byte-for-byte against pre-phase hashes; final rerun archived separately.');
