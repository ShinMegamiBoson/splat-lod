import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { LARGE_PROTOCOL } from './large-protocol.mjs';
import { formatLargeLead, largeRankings, LARGE_LABELS } from './format-large-report.mjs';
import { assertPublicData, assertPublicText } from './publication-privacy.mjs';

assert.equal(process.argv.length, 3, 'Pass the independently verified result directory');
const input = path.resolve(process.argv[2]);
const raw = await readFile(path.join(input, 'results.json'));
const full = JSON.parse(raw);
const verification = JSON.parse(await readFile(path.join(input, 'verification.json')));
const scenes = JSON.parse(await readFile(new URL('./large-scenes.json', import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert(verification.passed);
assert.equal(verification.summarySha256, sha(raw));
assert.deepEqual(full.protocol, LARGE_PROTOCOL);
assert.deepEqual(full.scenes, scenes);
const expected = scenes.flatMap(scene => Array.from({ length: LARGE_PROTOCOL.repeats }, (_, round) => (round % 2 ? [...LARGE_PROTOCOL.modes].reverse() : LARGE_PROTOCOL.modes).map(mode => ({ scene, round, mode })))).flat();
assert.equal(full.reportCount, expected.length);
assert.equal(full.reports.length, expected.length);
assert.equal(full.rows.length, scenes.length * LARGE_PROTOCOL.modes.length);
full.reports.forEach((report, i) => {
    assert.equal(report.index, i);
    assert.equal(report.mode, expected[i].mode);
    assert.equal(report.round, expected[i].round);
    assert.deepEqual(report.scene, expected[i].scene);
    assert.equal(report.run, full.reports[0].run);
    assert(!report.pilot);
    assert.deepEqual(report.evidence, full.reports[0].evidence);
});
assertPublicData(full);
const { reports, ...compact } = full;
const summary = { ...compact,
    evidence: reports[0].evidence,
    benchmarkSpecs: { chip: 'Apple M5 Max', memory: '128 GB', browser: reports[0].userAgent, physicalPixels: [2560, 1440] },
    conditions: 'Power, thermal state and unrelated system activity were not controlled. Treat this as a two-trial device-specific test, not a statistical ranking or a cross-cohort runtime improvement.',
    rankings: largeRankings(full),
    automaticPaths: reports.filter(r => r.mode === 'ours-auto').map((r) => {
        const frames = r.phases.moving?.samples ?? [];
        return { scene: r.scene.id,
            round: r.round,
            passed: r.passed,
            timedFrames: frames.length,
            reducedFrames: frames.filter(f => f.path?.path === 'lod').length,
            directFrames: frames.filter(f => f.path?.path === 'direct').length,
            probeFrames: frames.filter(f => f.path?.probing).length,
            capturePaths: r.quality.map(q => q.stats.performance?.path ?? null) };
    }),
    rawArchive: 'results.json.gz',
    uncompressedResultsSha256: sha(raw),
    verification };
assertPublicData(summary);
summary.rankings.forEach((rank, i) => {
    const independent = verification.rankingChecks[i];
    assert.equal(rank.scene, independent.scene);
    assert.deepEqual(rank.winners, independent.winners);
    assert.equal(rank.complete, independent.complete);
    assert.equal(rank.speedup, independent.speedup);
});
const lead = formatLargeLead(summary);
const f = v => v.toFixed(2);
const table = rows => rows.map(r => `| ${r.join(' | ')} |`).join('\n');
const detail = table([
    ['Scene', 'Renderer', 'Moving mean / median / p95 ms', 'Static median ms', 'Interactive RAF/s, trials 1 / 2'],
    ['---', '---', '---:', '---:', '---:'],
    ...full.rows.map(r => [scenes.find(s => s.id === r.scene).name, LARGE_LABELS[r.mode],
        r.passed ? `${f(r.movingMs.mean)} / ${f(r.movingMs.median)} / ${f(r.movingMs.p95)}` : 'unranked',
        r.passed ? f(r.staticMs.median) : 'unranked',
        r.passed ? r.interactiveFps.map(f).join(' / ') : 'unranked'])
]);
const paths = table([
    ['Scene / trial', 'LOD timing frames', 'Direct timing frames', 'Probe frames (included)', 'Capture paths'],
    ['---', '---:', '---:', '---:', '---'],
    ...summary.automaticPaths.map(p => [`${p.scene} / ${p.round + 1}`, `${p.reducedFrames}/${p.timedFrames}`, `${p.directFrames}/${p.timedFrames}`, p.probeFrames, p.capturePaths.join(', ')])
]);
const report = `${[
    '# Large-scene benchmark results',
    lead.replaceAll('(packages/splat-lod/', '(../../../'),
    '## Complete timing table',
    detail,
    'Interactive RAF/s counts animation-frame submissions, not confirmed physical presentation. Spark can use a stale asynchronous sort in that track. Completed-frame timing waits for current-view sorting. Neither metric alone is a universal renderer ranking.',
    '## Automatic LOD paths',
    paths,
    'Probe frames are included, not discarded. Fixed LOD is retained as an unranked diagnostic in the primary table; its timing and quality controls are not mixed with the automatic renderer.',
    '## Evidence and conditions',
    `${verification.qualityPairsChecked} image pairs, ${verification.timedFramesChecked} timed frames and ${verification.warmupFramesChecked} warmups independently checked in Python/NumPy. ${full.reportCount - full.passedCount} failed cases retained.`,
    summary.conditions,
    '[Summary and rankings](summary.json) · [Every frame and image-error numerator](results.json.gz) · [Independent verification](verification.json) · [Frozen protocol and reproduction](../../LARGE.md)',
    '## Inputs and credits',
    ...scenes.map(s => `[${s.name}](${s.sceneUrl}) by ${s.creator} · [${s.license}](${s.licenseUrl}) · ${s.count.toLocaleString('en-US')} splats · SH${s.shBands}. ${s.sourceDescription}`),
    'Scans, reduced banks and raw image captures stay out of the published repository. Source and image digests in the numeric archive identify the exact local inputs checked.'
].join('\n\n')}\n`;
assertPublicText(report);
const destination = new URL('./measurements/2026-09-06-large/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('results.json.gz', destination), gzipSync(raw, { level: 9 }));
await writeFile(new URL('summary.json', destination), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(new URL('verification.json', destination), `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(new URL('README.md', destination), report);
const readmeUrl = new URL('../../../README.md', import.meta.url);
const readme = await readFile(readmeUrl, 'utf8');
const block = `<!-- large-benchmark:start -->\n${lead}\n<!-- large-benchmark:end -->`;
const updated = readme.includes('<!-- large-benchmark:start -->') ?
    readme.replace(/<!-- large-benchmark:start -->[\s\S]*?<!-- large-benchmark:end -->/, block) :
    readme.replace('<!-- benefit-rerun:start -->', `${block}\n\n<!-- benefit-rerun:start -->`);
assertPublicText(updated);
await writeFile(readmeUrl, updated);
console.log('Published all large-scene cases and derived the front-page rankings.');
