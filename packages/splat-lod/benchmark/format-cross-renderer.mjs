import assert from 'node:assert/strict';

// The historical cohort is deliberately separate from the current runtime's reruns.
export function formatCrossRendererComparison(summary) {
    assert.equal(summary.protocol.version, 2);
    assert.equal(summary.reportCount, 36);
    assert.equal(summary.passedCount, 36);
    const evidence = summary.evidence ?? summary.reports[0].evidence;
    assert.equal(evidence.librarySha256, '93f755175d0ee59273bd3e61f68a8879b8fcfcfa8b60a7cd3a008341b1afdfc1');
    const row = (scene, mode) => summary.rows.find(r => r.scene === scene && r.mode === mode);
    const f = n => n.toFixed(2);
    const table = rows => rows.map(r => `| ${r.join(' | ')} |`).join('\n');
    const latency = table([
        ['Scene / original splats', 'Our v0.1, LOD 2×', 'PC 2.22 defaults', 'PC 2.22 full quality', 'Spark 2.1¹', 'luma.gl 9.4²'],
        ['---', '---:', '---:', '---:', '---:', '---:'],
        ...summary.scenes.map(s => [`${s.name} · ${f(s.count / 1e6)}M`,
            ...['ours-lod', 'pc-default', 'pc-full', 'spark', 'luma'].map(m => `${f(row(s.id, m).movingMs.median)} ms`)])
    ]);
    const quality = table([
        ['Scene', 'Our v0.1, LOD 2×', 'PC defaults', 'Spark 2.1', 'luma.gl 9.4'],
        ['---', '---:', '---:', '---:', '---:'],
        ...summary.scenes.map(s => [s.name,
            ...['ours-lod', 'pc-default', 'spark', 'luma'].map(m => `${f(row(s.id, m).minForegroundPsnrDb)} dB`)])
    ]);
    const ours = row('ekotori', 'ours-lod'), defaults = row('ekotori', 'pc-default');
    return [
        '## Multi-scene benchmarks — PlayCanvas, Spark and luma.gl',
        '**Historical same-run comparison, September 6, 2026 UTC:** our v0.1.0 bundle, PlayCanvas 2.22.0, Spark 2.1.0 and luma.gl 9.4.0. These are not new v0.3 measurements. Three complete SH3 scenes at 2560×1440 on an Apple M5 Max with 128 GiB RAM; two reversed-order trials, 6,480 timed frames.',
        'Median frame times while moving the camera, including current-view sorting and GPU completion—not interactive FPS:',
        latency,
        'Minimum foreground RGB PSNR across five poses and both trials, against same-trial **PC full quality**. Higher is better; the reference compared with itself has zero error. These quality values come from the same configurations and cohort as the speed table.',
        quality,
        `In this run, v0.1 is slower than PC defaults on the bee and cicada. The shop is ${f(defaults.movingMs.median / ours.movingMs.median)}× faster at the median, but loses quality and has bad frame-time spikes: p95 is ${f(ours.movingMs.p95)} ms versus ${f(defaults.movingMs.p95)} ms. Faster is not automatically better: Spark and luma.gl retain more foreground detail than our LOD in these tests.`,
        'PC defaults keeps its size/contribution cutoffs and cached-SH threshold; full quality disables those approximations. Foreground PSNR avoids diluting error with empty background, but is still only a five-pose test. The LOD setting of 2× changes transition distances; it doesn\'t mean twice the FPS.',
        '¹ Spark\'s completed-frame test waits for a current-camera sort. Its normal asynchronous loop is timed separately, so this is not a claim that its interactive FPS is this much slower. ² luma.gl\'s renderer is experimental. All use SH3, but parameter packing, projection/filtering and sorting differ.',
        '[Full results, p95 and interactive timings](packages/splat-lod/BENCHMARKS.md) · [Pinned versions and methodology](packages/splat-lod/benchmark/README.md) · [Raw measurements](packages/splat-lod/benchmark/measurements/2026-09-05/summary.json)'
    ].join('\n\n');
}
