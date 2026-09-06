import assert from 'node:assert/strict';
import { LARGE_PROTOCOL } from './large-protocol.mjs';
import { rankRenderers } from './rank-renderers.mjs';

export const LARGE_LABELS = Object.freeze({
    'ours-auto': 'Splat LOD v0.3',
    'ours-fixed': 'Splat LOD fixed 2×',
    'pc-default': 'PC defaults',
    'pc-full': 'PC full quality',
    spark: 'Spark 2.1',
    luma: 'luma.gl 9.4'
});
const modes = ['ours-auto', 'pc-default', 'pc-full', 'spark', 'luma'];
const f = value => value.toFixed(2);
const table = rows => rows.map(row => `| ${row.join(' | ')} |`).join('\n');

export function largeRankings(summary) {
    assert.deepEqual(summary.protocol, LARGE_PROTOCOL);
    return summary.scenes.map(scene => ({ scene: scene.id,
        ...rankRenderers(
            summary.rows.filter(row => row.scene === scene.id), LARGE_PROTOCOL.rankedModes, LARGE_PROTOCOL.nearTieFraction
        ) }));
}

export function formatLargeTables(summary) {
    const rankings = largeRankings(summary);
    const row = (scene, mode) => summary.rows.find(r => r.scene === scene && r.mode === mode);
    const quality = r => (!r?.passed ? 'unranked' : r.minForegroundPsnrDb === null ? '∞' : `${f(r.minForegroundPsnrDb)} dB`);
    const speed = table([
        ['Scene / input splats', 'Fastest', 'Over next-best', ...modes.map(m => LARGE_LABELS[m])],
        ['---', '---', '---:', ...modes.map(() => '---:')],
        ...summary.scenes.map((scene, i) => {
            const rank = rankings[i];
            return [`${scene.name} · ${f(scene.count / 1e6)}M`, rank.winners.map(m => LARGE_LABELS[m]).join(' / ') || 'none',
                rank.speedup === null ? '—' : `${f(rank.speedup)}×${rank.nearTie ? ' (near-tie)' : ''}${!rank.complete ? ' (partial field)' : ''}`,
                ...modes.map((mode) => {
                    const r = row(scene.id, mode);
                    if (!r?.passed) return 'unranked';
                    const value = `${f(r.movingMs.median)} ms`;
                    return rank.winners.includes(mode) ? `**${value}**` : value;
                })];
        })
    ]);
    const imageQuality = table([
        ['Scene', ...modes.map(m => LARGE_LABELS[m])], ['---', ...modes.map(() => '---:')],
        ...summary.scenes.map(scene => [scene.name, ...modes.map(mode => quality(row(scene.id, mode)))])
    ]);
    const fixedControl = table([
        ['Scene', 'Fixed LOD moving median / p95', 'Fixed LOD minimum foreground PSNR'], ['---', '---:', '---:'],
        ...summary.scenes.map((scene) => {
            const r = row(scene.id, 'ours-fixed');
            return [scene.name, r?.passed ? `${f(r.movingMs.median)} / ${f(r.movingMs.p95)} ms` : 'unranked', quality(r)];
        })
    ]);
    return { speed, imageQuality, fixedControl };
}

export function formatLargeLead(summary) {
    const tables = formatLargeTables(summary);
    const paths = summary.automaticPaths;
    assert(paths?.length, 'Actual automatic render paths must accompany the table');
    const timed = paths.reduce((n, p) => n + p.timedFrames, 0);
    const direct = paths.reduce((n, p) => n + p.directFrames, 0);
    const pathNote = direct === timed ?
        `Automatic mode used **original splats for all ${timed} measured moving frames**. These timings measure its optimized direct fallback, not an LOD speedup.` :
        `Automatic mode used originals for ${direct}/${timed} measured moving frames; the remainder used LOD. Both paths and probes are included.`;
    const captures = summary.scenes.map((scene) => {
        const captured = paths.filter(p => p.scene === scene.id).flatMap(p => p.capturePaths);
        return `${scene.name}: ${captured.filter(p => p === 'direct').length} original / ${captured.filter(p => p === 'lod').length} LOD`;
    }).join('; ');
    return [
        '## Large-scene benchmarks',
        'September 6, 2026 · Splat LOD v0.3 · Apple M5 Max, 128 GB · **2560×1440**. Three new, distinct scenes; full published resolution, including LCC2Rock\'s environment. Rocca has SH3; the other two are natively SH0.',
        '**Moving-camera median frame time; lower is better.** Bold is the fastest measured configuration. “Over next-best” is its speedup over second place—not necessarily our speedup. PC = PlayCanvas. Margins within 5% are near-ties, not established wins.',
        tables.speed,
        pathNote,
        `PlayCanvas is 2.23.0-beta.2 on the same engine base as this library. Two reversed-order trials; ${summary.passedCount}/${summary.reportCount} cases completed. Timings include current-view sorting and a GPU completion fence, so they are **not interactive FPS**. Spark waits for its worker sort here; its normal asynchronous loop is reported separately. luma.gl is experimental. Different default approximations mean this is not a quality-matched race.`,
        '### Quality',
        'Worst foreground RGB PSNR across five poses and both trials versus full-quality PlayCanvas; higher is better. ∞ means zero measured error, not a general equivalence guarantee. These are separate image captures, not measurements of every timed frame.',
        tables.imageQuality,
        `**Quality captures can use a different path from the timing frames.** ${captures}. The fixed-LOD control below keeps reduction enabled for both timing and captures:`,
        tables.fixedControl,
        'LOD trades quality for speed. The 2× setting changes transition distances, not FPS. These short paths on one device do not establish a universal fastest renderer or all-angle quality.',
        '[All frame times, actual LOD paths and source credits](packages/splat-lod/benchmark/measurements/2026-09-06-large/README.md) · [Reproduce](packages/splat-lod/benchmark/LARGE.md) · [Numeric results](packages/splat-lod/benchmark/measurements/2026-09-06-large/summary.json)'
    ].join('\n\n');
}
