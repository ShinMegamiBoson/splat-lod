import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sequence } from './sequence.mjs';
import { formatCrossRendererComparison } from './format-cross-renderer.mjs';
import { assertPublicData } from './publication-privacy.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const input = await readFile(process.argv[2]), summary = JSON.parse(input);
const inputDirectory = path.dirname(process.argv[2]);
const verification = JSON.parse(await readFile(path.join(inputDirectory, 'verification.json')));
if (!verification.passed || verification.summarySha256 !== createHash('sha256').update(input).digest('hex')) throw new Error('Independent verification is missing or stale');
if (summary.passedCount !== 36 || summary.reportCount !== 36) throw new Error('Publish only the complete 36-case report');
assertPublicData(summary);
const destination = path.join(root, 'measurements/2026-09-05');
await mkdir(path.join(destination, 'runs'), { recursive: true });
const { reports, ...compact } = summary;
compact.hardware = { cpu: 'Apple M5 Max',
    memoryBytes: 137438953472,
    os: 'macOS 26.4 (25E246)',
    browser: reports[0].userAgent,
    physicalRenderSize: [2560, 1440],
    cssViewport: [1280, 720],
    devicePixelRatio: 2 };
compact.evidence = reports[0].evidence;
await sequence(reports, r => writeFile(path.join(destination, 'runs', `${r.scene.id}-${r.mode}-${r.round}.json`), `${JSON.stringify(r, null, 2)}\n`));
await writeFile(path.join(destination, 'summary.json'), `${JSON.stringify(compact, null, 2)}\n`);
await writeFile(path.join(destination, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(path.join(destination, 'case-selection.json'), await readFile(path.join(inputDirectory, 'case-selection.json')));
const attempts = [];
await sequence(['multi-scene-20260906-r1', 'multi-scene-20260906-r2', 'multi-scene-20260906-r3'], async (run) => {
    await sequence(Array.from({ length: 36 }, (_, i) => i), async (index) => {
        let r;
        try {
            r = JSON.parse(await readFile(path.join(root, 'results', run, String(index), 'report.json')));
        } catch (error) {
            if (error.code === 'ENOENT') return; throw error;
        }
        attempts.push({ run,
            index,
            scene: r.scene.id,
            mode: r.mode,
            passed: r.passed,
            error: r.error?.message || null,
            included: run === 'multi-scene-20260906-r2' && index < 24 });
    });
});
assertPublicData(attempts);
await writeFile(path.join(destination, 'development-attempts.json'), `${JSON.stringify(attempts, null, 2)}\n`);

const row = (scene, mode) => summary.rows.find(r => r.scene === scene && r.mode === mode);
const names = { 'pc-default': 'PlayCanvas 2.22 defaults',
    'pc-full': 'PlayCanvas 2.22 full quality',
    'ours-source': 'Ours · LOD off',
    'ours-lod': 'Ours · 2× sooner LOD',
    spark: 'Spark 2.1 · fresh sort',
    luma: 'luma.gl 9.4 · experimental' };
const f = n => (Number.isFinite(n) ? n.toFixed(2) : '—');
const frames = reports.reduce((sum, r) => sum + r.phases.static.samples.length + r.phases.moving.samples.length, 0);
const readmeFile = path.resolve(root, '../../../README.md');
const readme = await readFile(readmeFile, 'utf8');
const start = '<!-- multi-scene-benchmark:start -->', end = '<!-- multi-scene-benchmark:end -->';
if (!readme.includes(start) || !readme.includes(end)) throw new Error('Missing publication markers');
const lead = formatCrossRendererComparison(summary);
await writeFile(readmeFile, `${readme.slice(0, readme.indexOf(start) + start.length)}\n${lead}\n${readme.slice(readme.indexOf(end))}`);

const detailed = summary.scenes.map((s) => {
    const table = ['| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...summary.protocol.modes.map((mode) => {
            const r = row(s.id, mode);
            return `| ${names[mode]} | ${mode === 'luma' ? 'Cached, no redraw' : `${f(r.staticMs.median)} ms`} | ${f(r.movingMs.median)} / ${f(r.movingMs.p95)} ms | ${r.interactiveFps.map(f).join(' / ')} | ${f(r.minPsnrDb)} / ${f(r.minForegroundPsnrDb)} dB |`;
        })].join('\n');
    const selected = row(s.id, 'ours-lod').selectedSplats;
    return `## ${s.name}\n\n[Source / creator: ${s.creator}](${s.sceneUrl}) · ${s.count.toLocaleString('en-US')} originals · cube edge ${s.cellSize} scene units. Our LOD selected **${Math.min(...selected).toLocaleString('en-US')}–${Math.max(...selected).toLocaleString('en-US')}** splats across the five quality poses.\n\n${table}`;
}).join('\n\n');
const report = `# Multi-scene renderer benchmark\n\nRecorded September 5, 2026 local time (September 6 UTC), using the **standalone v0.1.0 runtime bundle**. Hardware: Apple M5 Max, 128 GiB, macOS 26.4, Metal 3. Browser: ${reports[0].userAgent}. Physical framebuffer **2560×1440**; fixed CSS viewport **1280×720**, DPR 2.\n\nThree complete scenes × six configurations × two counterbalanced trials. **${frames.toLocaleString('en-US')} timed completed frames**, 36 four-second interactive passes, and 180 full-resolution quality captures. All 36 cases completed. No scene or derived image is redistributed.\n\n${detailed}\n\n## How to read these numbers\n\n- **Completed-frame latency**, not GPU-only time: camera preparation, current-view sorting, draw submission and GPU completion fence are included. Readbacks and loading are excluded. There are 180 static and 180 moving samples per scene/configuration. Medians and p95 are pooled across two trials; individual trials and every sample are retained.\n- **Interactive RAF/s** counts browser animation callbacks submitting frames, not physically presented frames. The path runs for four seconds without a per-frame GPU fence; the browser may cap cadence around 120 Hz, queue GPU work, or reuse stale sorting. Do not substitute these values for fresh-view latency. Spark's per-callback sort lag is recorded.\n- **Default ≠ full quality.** Stock defaults retain their 2-pixel size filter, minimum contribution 3, SH update angle 10°, source format, reorder and budget. The reference disables those approximations, uses current-view SH3 and decompressed parameters. Both use the same camera, output size, background and no tone mapping.\n- **LOD is lossy.** Foreground PSNR is intentionally reported because background inflates full-image PSNR. The foreground mask is a reference-only RGB/background threshold, not a true alpha silhouette. Five path poses cannot certify all-angle or temporal quality. Reference-versus-itself PSNR is exact (shown as —).\n- **Different renderers, different pixels.** Spark adds PackedSplats quantization and uses asynchronous worker sorting in its interactive loop; its completed-frame test waits for a current-camera sort. luma.gl uses Float32 SH3 pages, a 16-bit global depth key, and different projection/filtering. Its unchanged static scene is reused, not newly rendered, so its static cached latency is not ranked.\n- **Memory is not reduced.** Ours keeps original and three replacement banks resident, approximately 1.875× the source record count before working buffers. This benchmark excludes preprocessing, downloads, load time and peak-memory measurement.\n- **Limited evidence.** One device/browser, two trials and short paths; no universal ranking, significance test, mobile qualification, or negligible-error claim. The unreported development pass ran alongside tooling work, changed browser CSS size and eventually hit allocation failures; it was used for harness validation, not mixed into this frozen production-build result.\n\n## Reproduction and provenance\n\n[Run the pinned harness](benchmark/README.md). [Summary, settings and hardware](benchmark/measurements/2026-09-05/summary.json). [All per-frame timing samples, quality numerators and capture hashes](benchmark/measurements/2026-09-05/runs).\n\n- Harness revision: \`${reports[0].evidence.harnessRevision}\`.\n- Executed production harness SHA-256: \`${reports[0].evidence.harnessSha256}\`.\n- Standalone bundle SHA-256: \`${reports[0].evidence.librarySha256}\`, verified equal to the previously installed release package.\n- Sources, camera transforms, clipping planes, cube sizes and immutable input hashes: [scenes.mjs](benchmark/scenes.mjs).\n\nThe comparison covers PlayCanvas, Spark and luma.gl, not every renderer. GaussianSplats3D and gsplat.js were surveyed but excluded from SH3 headline comparisons; their limitations and primary-source links are in the [methodology](benchmark/README.md).\n`;
const isolation = '## Large-scene isolation\n\nThe two object scenes use the frozen production batch `multi-scene-20260906-r2`. Every shop case was rerun, in the prescribed order, in its own independently closed tab (`multi-scene-20260906-r4`), with the viewport set before starting. Repeated large-scene loads in one embedded-browser tab hit allocation failures even after history replacement; those attempts are excluded as failed setup, not ranked as rendering performance. This lifetime issue is not claimed to be fixed in the engines. All shop configurations use the same isolation procedure, and no case was chosen because it was faster. Original run IDs and failed-batch statuses are retained with the evidence.\n\n';
const proof = 'Independent [Python/NumPy verification](benchmark/measurements/2026-09-05/verification.json) recomputed all 180 image comparisons and all 18 timing rows. [Case selection](benchmark/measurements/2026-09-05/case-selection.json) and [development-attempt statuses](benchmark/measurements/2026-09-05/development-attempts.json) retain the setup failures and exact inclusion boundary.\n\n';
await writeFile(path.resolve(root, '../BENCHMARKS.md'), report.replace('## Reproduction and provenance', `${isolation}## Reproduction and provenance\n\n${proof}`));
console.log('Generated README benchmark section, full report, and numeric evidence. No scan images were published.');
