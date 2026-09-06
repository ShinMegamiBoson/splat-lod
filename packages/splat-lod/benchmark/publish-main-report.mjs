import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { MAIN_PROTOCOL } from './main-protocol.mjs';
import { sequence } from './sequence.mjs';
import { assertPublicData } from './publication-privacy.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const input = path.resolve(process.argv[2]);
const bytes = await readFile(path.join(input, 'results.json'));
const summary = JSON.parse(bytes);
const verification = JSON.parse(await readFile(path.join(input, 'verification.json')));
assert(verification.passed);
assert.equal(verification.summarySha256, createHash('sha256').update(bytes).digest('hex'));
assert.deepEqual(summary.protocol, MAIN_PROTOCOL);
assert.equal(summary.reportCount, 56);
assert.equal(summary.passedCount, 56);
assertPublicData(summary);
const { reports, ...compact } = summary;
const evidence = reports[0].evidence;
assert.equal(evidence.upstreamRevision, MAIN_PROTOCOL.engineRevision);
assert(reports.every(r => r.run === 'pc-main-20260906-r2' && r.passed && !r.pilot));
for (const r of reports) assert.deepEqual(r.evidence, evidence);
compact.hardware = {
    cpu: 'Apple M5 Max',
    memoryBytes: 137438953472,
    os: 'macOS 26.4 (25E246)',
    browser: reports[0].userAgent,
    physicalRenderSize: [2560, 1440],
    cssViewport: [1280, 720],
    devicePixelRatio: reports[0].devicePixelRatio,
    explicitFramebufferScale: 2
};
compact.evidence = evidence;
const destination = path.join(root, 'measurements/2026-09-06');
await mkdir(path.join(destination, 'runs'), { recursive: true });
const save = (name, value) => writeFile(path.join(destination, name), `${JSON.stringify(value, null, 2)}\n`);
await sequence(reports, r => save(`runs/${r.scene.id}-${r.mode}-${r.round}.json`, r));
await save('summary.json', compact);
await save('verification.json', verification);
await save('case-selection.json', reports.map(r => ({ index: r.index, run: r.run, scene: r.scene.id, mode: r.mode, round: r.round })));
await save('attempts.json', [
    { run: 'pc-main-20260906',
        index: 0,
        included: false,
        outcome: 'operator-cancelled',
        reason: 'The browser wait timed out after about five seconds despite a longer requested timeout. Cleanup closed the first tab. The entire attempt was excluded before speed comparison; this was not a renderer failure.' },
    { run: 'pc-main-20260906-r2',
        included: true,
        indices: [0, 55],
        count: 56,
        reason: 'Fresh independently closed tab per case, both trials, prescribed order. Transient UI-read timeouts left the active measurement running; no case was replaced or chosen by speed.' }
]);

const row = (scene, mode) => summary.rows.find(r => r.scene === scene && r.mode === mode);
const f = n => (Number.isFinite(n) ? n.toFixed(2) : '—');
const names = { 'pc-full': 'PC full quality',
    'ours-lod': 'Our LOD 2×, no extra culling',
    'ours-contribution': 'Our LOD + contribution 3',
    'ours-defaults': 'Our LOD + PC culling',
    'ours-cached': 'Our LOD + PC culling + cached SH',
    'pc-default': 'PC defaults',
    'ours-source': 'Ours, LOD off' };
const ticks = String.fromCharCode(96);
const code = s => ticks + s + ticks;
const table = rows => rows.map(r => `| ${r.join(' | ')} |`).join('\n');
const leadTable = table([
    ['Scene / input splats', 'Our LOD median / p95', 'PC defaults median / p95', 'Speedup', 'Min foreground PSNR, ours / PC'],
    ['---', '---:', '---:', '---:', '---:'],
    ...summary.scenes.map((s) => {
        const a = row(s.id, 'ours-lod'), b = row(s.id, 'pc-default');
        return [`${s.name} · ${(s.count / 1e6).toFixed(2)}M`,
            `${f(a.movingMs.median)} / ${f(a.movingMs.p95)} ms`,
            `${f(b.movingMs.median)} / ${f(b.movingMs.p95)} ms`,
            `${f(b.movingMs.median / a.movingMs.median)}×`,
            `${f(a.minForegroundPsnrDb)} / ${f(b.minForegroundPsnrDb)} dB`];
    })
]);
const lead = [
    '## Benchmarks on current PlayCanvas main',
    `Same engine base on both sides: [d753e98](https://github.com/playcanvas/engine/commit/${evidence.upstreamRevision}), 2.23.0-beta.2. Apple M5 Max, 128 GiB, 2560×1440. Four inputs, seven configurations, two reversed-order trials: **10,080 timed frames**.`,
    'Our default LOD is faster than stock defaults on the shop and both city inputs, but slower on the bee. Quality varies by scene too; this is not a lossless speedup.',
    leadTable,
    'Moving-camera completed-frame latency, including sorting and a GPU completion fence—not interactive FPS. Speedup is PC defaults divided by ours; below 1× is slower. PSNR uses PC full quality as the reference. Higher is better.',
    'The city rows are two published LOD levels of the **same** Lublin scan, not two independent scenes or the full 259M-splat original. They contain 16,184,440 and 32,368,879 SH0 splats. Bee and shop retain SH3. Every input splat is loaded before our LOD selection.',
    'I also tried PC’s contribution culling, small-splat culling and cached SH. They are available as explicit options. The extra culling loses too much detail on the bee and 32M city input to make it the default; cached SH did not give a consistent win. [Settings and all seven results](packages/splat-lod/MAIN-BENCHMARKS.md).',
    '[Reproduce it](packages/splat-lod/benchmark/MAIN.md) · [Per-frame data and checks](packages/splat-lod/benchmark/measurements/2026-09-06/summary.json)',
    'Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com).'
].join('\n\n');
const readmeFile = path.resolve(root, '../../../README.md');
const readme = await readFile(readmeFile, 'utf8');
const start = '<!-- main-benchmark:start -->', end = '<!-- main-benchmark:end -->';
assert(readme.includes(start) && readme.includes(end));
await writeFile(readmeFile, `${readme.slice(0, readme.indexOf(start) + start.length)}\n${lead}\n${readme.slice(readme.indexOf(end))}`);

const detailed = summary.scenes.map((s) => {
    const selected = row(s.id, 'ours-lod').selectedSplats;
    return [
        `## ${s.name}`,
        `${s.count.toLocaleString('en-US')} input splats, SH${s.shBands ?? 3}, cube edge ${s.cellSize} scene units. LOD selected ${Math.min(...selected).toLocaleString('en-US')}–${Math.max(...selected).toLocaleString('en-US')} splats across the five quality poses. [Source / creator: ${s.creator}](${s.sceneUrl}).`,
        s.sourceDescription ?? '',
        table([
            ['Configuration', 'Static median', 'Moving median / p95', 'Interactive RAF/s, trials 1 / 2', 'Min RGB / foreground PSNR'],
            ['---', '---:', '---:', '---:', '---:'],
            ...summary.protocol.modes.map((m) => {
                const r = row(s.id, m);
                return [names[m], `${f(r.staticMs.median)} ms`, `${f(r.movingMs.median)} / ${f(r.movingMs.p95)} ms`,
                    r.interactiveFps.map(f).join(' / '), `${f(r.minPsnrDb)} / ${f(r.minForegroundPsnrDb)} dB`];
            })
        ]),
        `<details>\n<summary>Moving medians in each trial</summary>\n\n${table([
            ['Configuration', 'Trial 1', 'Trial 2'], ['---', '---:', '---:'],
            ...summary.protocol.modes.map(m => [names[m], ...row(s.id, m).perTrial.map(t => `${f(t.movingMedianMs)} ms`)])
        ])}\n\n</details>`
    ].filter(Boolean).join('\n\n');
}).join('\n\n');
const deltas = summary.scenes.flatMap(s => ['ours-contribution', 'ours-defaults', 'ours-cached'].map((mode) => {
    const base = row(s.id, 'ours-lod'), candidate = row(s.id, mode);
    const qualityLossDb = base.minForegroundPsnrDb - candidate.minForegroundPsnrDb;
    const medianReduction = 1 - candidate.movingMs.median / base.movingMs.median;
    const p95Ratio = candidate.movingMs.p95 / base.movingMs.p95;
    return { scene: s.id,
        mode,
        medianReduction,
        qualityLossDb,
        p95Ratio,
        passesSceneRule: medianReduction >= 0.05 && qualityLossDb <= 0.5 && p95Ratio <= 1.2 };
}));
await save('optimization-decision.json', {
    baseline: 'ours-lod',
    defaultChanged: false,
    rule: 'At least 5% lower moving median, at most 0.5 dB lost minimum foreground PSNR and at most 20% higher moving p95 on every selection and validation input.',
    reason: 'No candidate passed the frozen rule on all four inputs. Keep exact/visible as default; the three tested alternatives remain opt-in.',
    deltas
});
const report = [
    '# PlayCanvas-main and large-scene benchmarks',
    `Recorded September 6, 2026. Apple M5 Max, 128 GiB, macOS 26.4 (25E246), WebGPU / Metal 3. Fixed framebuffer 2560×1440, CSS viewport 1280×720, explicit 2× backing resolution. The controlled browser viewport reports DPR ${reports[0].devicePixelRatio}; the harness sets framebuffer dimensions independently. Browser: ${reports[0].userAgent}.`,
    `Both the fork and stock controls use upstream main ${code(evidence.upstreamRevision)}. The stock renderer code is unmodified. This is a new v0.2 result, not a reranking of the [v0.1 PlayCanvas / Spark / luma.gl comparison](BENCHMARKS.md). Those other renderers were not rerun in this batch.`,
    'All 56 cases completed: four inputs × seven configurations × two reversed-order trials. **10,080 completed-frame samples, 56 four-second interactive passes and 280 full-resolution quality captures.** [Independent NumPy verification](benchmark/measurements/2026-09-06/verification.json) recomputed every pixel comparison and timing row.',
    detailed,
    '## Which defaults changed?',
    `None. The default remains LOD multiplier 2 with ${code('renderSettings: { profile: \'exact\', shMode: \'visible\' }')}. LOD merging is still lossy. The word exact here means no additional projector cutoff, not exact replacement Gaussians.`,
    'The adoption rule was written before the run: at least 5% lower moving median, no more than 0.5 dB lost minimum foreground PSNR, and no more than 20% higher moving p95, on the two selection inputs and both larger validation inputs. No candidate passed all of that. [Every delta and decision](benchmark/measurements/2026-09-06/optimization-decision.json).',
    'Contribution culling is useful on the shop and 16M input, but drops too much detail on the bee and 32M input. Adding the two-pixel cutoff produced nearly the same minimum PSNR as contribution-only, but the images are not bit-identical and it showed no consistent extra speed benefit. Cached SH was not consistently faster and worsened the shop’s p95. SH0 city results cannot demonstrate a benefit from SH reuse.',
    `All three options are implemented and explicit: ${code('profile: \'contribution\'')}, ${code('profile: \'playcanvas\'')}, and ${code('shMode: \'cached\'')} with an optional ${code('colorUpdateAngle')}. [API](README.md#rendering-settings).`,
    '## What is and is not measured',
    '- Completed-frame latency includes camera preparation, current-view global GPU sorting, draw submission and a GPU completion fence. Downloads, initialization, preprocessing and image readback are excluded. Each row pools 180 static and 180 moving samples, after 20 warmups per phase per trial.\n- Interactive RAF/s counts callbacks submitting frames along a four-second path with no per-frame fence. It is not measured physical presentation, a latency guarantee or uncapped FPS; some results hit the browser’s 120 Hz ceiling.\n- PC defaults keeps upstream minPixelSize=2, minContribution=3, cached color updates at 10 degrees, default source format/reorder and budget. PC full quality uses zero cutoffs, current-view SH and decompressed, unreordered originals. Both use the same camera, resolution, opaque background and no tone mapping. Flat PLY banks do not use the streaming-LOD splat budget.\n- PSNR compares five ordered poses to the same-trial full-quality reference. Foreground uses only reference RGB differing from the background by more than 3/255, not a true alpha matte. “—” means zero reference-versus-itself error. Short paths and two trials do not certify all-angle, temporal or perceptual quality.\n- All four banks remain resident: roughly 1.875× the source records, plus working buffers. The 32M input has 60,697,057 resident records. This is not a streaming or memory-saving result.\n- The two city rows are related published LODs of one scan. They are large-input stress tests, not independent scene diversity. Native SH0 stays SH0; bee and shop keep all SH3 terms. No scene or derived image is redistributed.\n- One device, one browser backend, two trials. Per-trial variation and long-tail frames remain in the report; no significance or universal-speedup claim.',
    '## Reproduce and inspect',
    '[Setup and pinned inputs](benchmark/MAIN.md) · [Summary](benchmark/measurements/2026-09-06/summary.json) · [Every per-frame sample, settings and image-error numerator](benchmark/measurements/2026-09-06/runs) · [Case selection](benchmark/measurements/2026-09-06/case-selection.json) · [Attempt ledger](benchmark/measurements/2026-09-06/attempts.json).',
    `Executed feature/harness revision: ${code(evidence.harnessRevision)}. Standalone SHA-256: ${code(evidence.librarySha256)}. Upstream bundle SHA-256: ${code(evidence.upstreamBundleSha256)}. Executed harness SHA-256: ${code(evidence.harnessSha256)}. Later report/package changes do not change the tested runtime bytes.`,
    'Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com). [Dataset terms](https://drive.google.com/uc?export=download&id=1QIhzn0LUWgOZUBzX5ethVEPgog6bUaSb).'
].join('\n\n');
await writeFile(path.resolve(root, '../MAIN-BENCHMARKS.md'), `${report}\n`);
console.log('Published the complete verified v0.2 numeric report; no scan images or assets copied.');
