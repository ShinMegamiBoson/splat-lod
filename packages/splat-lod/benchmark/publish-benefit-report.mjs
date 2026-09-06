import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BENEFIT_PROTOCOL } from './benefit-protocol.mjs';
import { sequence } from './sequence.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const input = path.resolve(process.argv[2]);
const bytes = await readFile(path.join(input, 'results.json'));
const summary = JSON.parse(bytes), verification = JSON.parse(await readFile(path.join(input, 'verification.json')));
assert(verification.passed);
assert.equal(verification.summarySha256, createHash('sha256').update(bytes).digest('hex'));
assert.deepEqual(summary.protocol, BENEFIT_PROTOCOL);
assert.equal(summary.reportCount, 32); assert.equal(summary.passedCount, 32);
const { reports, ...compact } = summary, evidence = reports[0].evidence;
assert(reports.every(r => r.run === 'benefit-gate-20260906-r1' && r.passed && !r.pilot));
for (const r of reports) assert.deepEqual(r.evidence, evidence);
compact.hardware = { cpu: 'Apple M5 Max',
    memoryBytes: 137438953472,
    os: 'macOS 26.4 (25E246)',
    browser: reports[0].userAgent,
    physicalRenderSize: [2560, 1440],
    cssViewport: [1280, 720],
    devicePixelRatio: reports[0].devicePixelRatio };
compact.evidence = evidence;
const destination = path.join(root, 'measurements/2026-09-06-benefit');
await mkdir(path.join(destination, 'runs'), { recursive: true });
const save = (name, value) => writeFile(path.join(destination, name), `${JSON.stringify(value, null, 2)}\n`);
assert.equal(process.argv.length, 5, 'Pass the run directory, no-reduction proof and marginal-gain proof');
const controls = await Promise.all(process.argv.slice(3).map(async (file) => {
    const proof = JSON.parse(await readFile(file));
    assert(proof.passed && proof.bypass.passed);
    assert.equal(proof.info.performance.path, 'direct');
    assert.equal(proof.info.performance.probing, false);
    return { rawLocalProof: path.basename(file), proof };
}));
await save('fallback-controls.json', controls);
await sequence(reports, r => save(`runs/${r.scene.id}-${r.mode}-${r.round}.json`, r));
await save('summary.json', compact); await save('verification.json', verification);
await save('attempts.json', [
    { run: 'benefit-preflight-20260906', included: false, pilot: true, reason: 'Short SH3 setup smoke only, before the final frozen server/build. Not a speed result.' },
    { run: reports[0].run,
        included: true,
        indices: [0, 31],
        count: 32,
        reason: 'All prescribed cases and both reversed-order trials retained. An automation timeout during case 30 left the browser running; its saved result was recovered, not rerun or replaced.' }
]);
const pathCounts = frames => ({ frames: frames.length,
    direct: frames.filter(s => s.path?.path === 'direct').length,
    lod: frames.filter(s => s.path?.path === 'lod').length,
    probing: frames.filter(s => s.path?.probing).length });
const paths = reports.filter(r => r.mode === 'ours-auto').map(r => ({ index: r.index,
    scene: r.scene.id,
    round: r.round,
    warmups: pathCounts(Object.values(r.warmups).flat()),
    static: pathCounts(r.phases.static.samples),
    moving: pathCounts(r.phases.moving.samples),
    interactive: pathCounts(r.interactive.frames),
    lastMovingDecision: r.phases.moving.samples.at(-1).path,
    qualityPaths: r.quality.map(q => q.stats.performance.path) }));
await save('paths.json', paths);

const row = (scene, mode) => summary.rows.find(r => r.scene === scene && r.mode === mode);
const f = n => (Number.isFinite(n) ? n.toFixed(2) : '—');
const time = s => `${f(s.mean)} / ${f(s.median)} / ${f(s.p95)} ms`;
const table = rows => rows.map(r => `| ${r.join(' | ')} |`).join('\n');
const names = { 'pc-full': 'PC full quality', 'ours-direct': 'Our originals, direct', 'ours-fixed': 'Fixed LOD 2×', 'ours-auto': 'Automatic (includes probes)' };
const leadTable = table([
    ['Input', 'Direct mean / median / p95', 'Automatic mean / median / p95', 'Mean speedup'],
    ['---', '---:', '---:', '---:'],
    ...summary.scenes.map(s => [s.name, time(row(s.id, 'ours-direct').movingMs), time(row(s.id, 'ours-auto').movingMs),
        `${f(row(s.id, 'ours-direct').movingMs.mean / row(s.id, 'ours-auto').movingMs.mean)}×`])
]);
const lead = [
    '## LOD only when it helps',
    'v0.3 starts with the original splats, measures both paths, and keeps LOD only when it is cheaper. The fallback bypasses cube selection, prefix scans and range lookup. Same SH, culling and resolution either way.',
    'Moving-camera results on an Apple M5 Max, 2560×1440. Four inputs, four configurations, two reversed-order trials; **5,760 timed frames**, with probe frames included. Completed-frame latency includes a GPU completion fence; it is not interactive FPS.',
    leadTable,
    'These four paths benefited from LOD. A separate live no-reduction control verified fallback when LOD cost more. Automatic selection is not free: brief probes can run the losing path. The full report includes fixed-LOD controls, warmups, tails and the actual path used for each image.',
    'LOD is still lossy. On abrupt jumps, automatic quality captures can use originals; their higher PSNR is **not** the quality of the faster LOD frames. [All results and caveats](packages/splat-lod/BENEFIT-BENCHMARKS.md) · [Reproduce](packages/splat-lod/benchmark/BENEFIT.md).'
].join('\n\n');
const readmeFile = path.resolve(root, '../../../README.md'), readme = await readFile(readmeFile, 'utf8');
const start = '<!-- benefit-benchmark:start -->', end = '<!-- benefit-benchmark:end -->';
assert(readme.includes(start) && readme.includes(end));
await writeFile(readmeFile, `${readme.slice(0, readme.indexOf(start) + start.length)}\n${lead}\n${readme.slice(readme.indexOf(end))}`);

const details = summary.scenes.map(s => [
    `## ${s.name}`,
    `${s.count.toLocaleString('en-US')} source splats, SH${s.shBands ?? 3}. [Source / creator: ${s.creator}](${s.sceneUrl}).`,
    table([
        ['Configuration', 'Static mean / median / p95', 'Moving mean / median / p95', 'Interactive RAF/s, trials 1 / 2', 'Min foreground PSNR'],
        ['---', '---:', '---:', '---:', '---:'],
        ...summary.protocol.modes.map((m) => {
            const r = row(s.id, m); return [names[m], time(r.staticMs), time(r.movingMs), r.interactiveFps.map(f).join(' / '), `${f(r.minForegroundPsnrDb)} dB`];
        })
    ]),
    table([
        ['Automatic trial', 'Moving probe frames', 'Interactive probe frames', 'Paths in the five quality captures'],
        ['---', '---:', '---:', '---'],
        ...paths.filter(p => p.scene === s.id).map(p => [p.round + 1, `${p.moving.probing}/${p.moving.frames}`, `${p.interactive.probing}/${p.interactive.frames}`, p.qualityPaths.join(', ')])
    ]),
    `<details>\n<summary>Moving medians in each trial</summary>\n\n${table([
        ['Configuration', 'Trial 1', 'Trial 2'], ['---', '---:', '---:'],
        ...summary.protocol.modes.map(m => [names[m], ...row(s.id, m).perTrial.map(t => `${f(t.movingMedianMs)} ms`)])
    ])}\n\n</details>`
].join('\n\n')).join('\n\n');
const fallback = controls[0].proof, marginal = controls[1].proof;
assert(fallback.info.performance.decision.gain < 0);
assert(marginal.info.performance.decision.gain < 0.1);
await writeFile(path.resolve(root, '../BENEFIT-BENCHMARKS.md'), `${[
    '# Automatic LOD: cost and fallback',
    'Recorded September 6, 2026. Apple M5 Max, 128 GiB, macOS 26.4, Chrome 152 / WebGPU Metal 3. Same PlayCanvas main d753e98 on all paths. Fixed 2560×1440 framebuffer and 1280×720 CSS viewport.',
    'All 32 cases passed. Independent NumPy verification checked 160 image pairs, 5,760 timed frames, 4,096 warmups and every consecutive direct-path transition for skipped selection/prefix work. These are new v0.3 results; older release measurements are unchanged.',
    '## Read this before comparing PSNR',
    'The speed selector is active during automatic timings, including its rechecks. The five image captures jump between poses separately. Bee and shop fall back to originals during those jumps; do not pair their automatic timing with that near-original PSNR and call it lossless. The fixed-LOD row measures the approximation used by LOD. The path of every automatic image is listed below.',
    'Differences between automatic and fixed-LOD timing are not a new rasterizer optimization. Their steady LOD code is the same; probing changes GPU load, history and timing. Two trials on one device are not statistical evidence that the selector makes the LOD path itself faster.',
    details,
    '## Fallback and limitations',
    `A separate live SH0 torus control used multiplier ${fallback.info.lodMultiplier} so all ${fallback.info.chunkCount} visible chunks retained their ${fallback.info.sourceCount.toLocaleString('en-US')} originals. One saved comparison measured direct cost ${fallback.info.performance.decision.directMs.toFixed(6)} ms and LOD cost ${fallback.info.performance.decision.lodMs.toFixed(6)} ms; automatic mode chose direct. A later multiplier-${marginal.info.lodMultiplier} sample gained only ${f(100 * marginal.info.performance.decision.gain)}% and also chose direct. Eight moving-source frames produced zero selection passes, zero prefix scans and eight source dispatches. These are asynchronous policy cost estimates, not fence timing or display FPS. Rechecks may choose differently as costs vary; these saved decisions are not an always-direct assertion for the torus. [Raw controls](benchmark/measurements/2026-09-06-benefit/fallback-controls.json) · [Installed-package checks](VALIDATION-v0.3.json).`,
    'LOD requires a 10% median cost win to turn on, then at least 3% to stay on; its sampled p95 must stay within 10% of direct. These thresholds were fixed before the cohort. Short probes can use the slower representation, and measurements can become stale. No claim that every frame is faster; no crossfade or hidden quality reduction.',
    'All controls keep full source SH, zero size/contribution cutoffs, current-view global GPU sorting and the same framebuffer. Direct avoids LOD bookkeeping but does not unload the three replacement banks. All four banks remain resident. The city inputs are two published LOD levels of the same Lublin scan, not two independent scenes or the full 259M original.',
    'Completed-frame timing includes preparation, submission and waiting for GPU completion. The runtime selector itself inserts no completion fence. Interactive RAF/s counts callbacks, not measured physical presentation. Warmups are retained separately. PSNR uses reference-only foreground masking at 3/255, not a true alpha matte; five poses do not certify all-angle or temporal quality.',
    '## Reproduce',
    '[Protocol and commands](benchmark/BENEFIT.md) · [Summary](benchmark/measurements/2026-09-06-benefit/summary.json) · [Every frame](benchmark/measurements/2026-09-06-benefit/runs) · [Probe counts](benchmark/measurements/2026-09-06-benefit/paths.json) · [Verification](benchmark/measurements/2026-09-06-benefit/verification.json) · [Attempt ledger](benchmark/measurements/2026-09-06-benefit/attempts.json).',
    `Executed feature revision: ${evidence.harnessRevision}. Runtime SHA-256: ${evidence.librarySha256}. Harness SHA-256: ${evidence.harnessSha256}. Later report and example changes do not change these tested runtime bytes.`,
    'Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com). No scan assets or captures are redistributed.'
].join('\n\n')}\n`);
console.log('Published all verified v0.3 cases, including probe and fallback evidence.');
