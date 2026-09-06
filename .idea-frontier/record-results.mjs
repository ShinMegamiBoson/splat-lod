import { readFile, writeFile } from 'node:fs/promises';
const base = new URL('../packages/splat-lod/benchmark/measurements/2026-09-06/', import.meta.url);
const summary = JSON.parse(await readFile(new URL('summary.json', base)));
const decision = JSON.parse(await readFile(new URL('optimization-decision.json', base)));
for (const [proposal_id, mode] of [['P1', 'ours-contribution'], ['P2', 'ours-defaults'], ['P3', 'ours-cached']]) {
    const deltas = decision.deltas.filter(d => d.mode === mode);
    const result = {
        proposal_id, outcome: 'regressed',
        primary: {
            baseline: 'ours-lod',
            candidate: mode,
            delta: deltas.map(d => ({scene: d.scene, medianReduction: d.medianReduction})),
            uncertainty: 'Two reversed-order trials on one device; no confidence interval or significance claim.',
            perTrial: summary.rows.filter(r => ['ours-lod', mode].includes(r.mode)).map(r => ({scene:r.scene, mode:r.mode, values:r.perTrial}))
        },
        guardrails: {passed: false, deltas},
        protocol_deviations: [
            'Build command consolidated into build-main.mjs, pinning all three builds to the same ENGINE_BASE.',
            'Original run name pc-main-20260906 excluded after first-tab cleanup on an automation timeout; complete 56-case pc-main-20260906-r2 cohort used, with no fastest-attempt picking.',
            'Browser viewport reports DPR 1, not the initially assumed 2. All cases explicitly render the frozen 2560x1440 framebuffer inside 1280x720 CSS, verified from every raw capture; no resolution change.'
        ],
        artifacts: [
            'packages/splat-lod/benchmark/measurements/2026-09-06/summary.json',
            'packages/splat-lod/benchmark/measurements/2026-09-06/verification.json',
            'packages/splat-lod/benchmark/measurements/2026-09-06/optimization-decision.json'
        ],
        observations: [
            'Speed improves on some inputs but the universal promotion guard fails. Keep as explicit opt-in, not a new default.',
            'Minimum foreground PSNR losses versus existing LOD are about 9.6 dB on Bee and 4 dB on 32M Lublin.',
            mode === 'ours-cached' ? 'Native color cache increases shop moving p95 by 68.9%; SH0 city inputs do not isolate a directional-SH benefit.' : 'Contribution-only passes the per-scene rule on shop and 16M Lublin; this does not validate a universal policy.'
        ]
    };
    await writeFile(new URL('result-' + proposal_id + '.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
}
