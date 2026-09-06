import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageError, quantile, PROTOCOL } from './protocol.mjs';
import { sequence } from './sequence.mjs';
import { MAIN_PROTOCOL } from './main-protocol.mjs';
import { BENEFIT_PROTOCOL } from './benefit-protocol.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stats = a => ({ samples: a.length, median: quantile(a, 0.5), p95: quantile(a, 0.95), min: Math.min(...a), max: Math.max(...a) });

export async function summarize(directory, protocol = PROTOCOL) {
    const reports = [];
    await sequence((await readdir(directory)).filter(s => /^\d+$/.test(s)).sort((a, b) => Number(a) - Number(b)), async (name) => {
        const r = JSON.parse(await readFile(path.join(directory, name, 'report.json')));
        if (r.pilot) throw new Error('Pilot runs must not be published as benchmark results');
        if (JSON.stringify(r.protocol) !== JSON.stringify(protocol)) throw new Error('Mixed or obsolete benchmark protocol');
        if (r.passed && ['static', 'moving'].some(phase => r.phases[phase].samples.length !== protocol.samples)) throw new Error('Missing timing frames');
        reports.push(r);
    });
    if (!reports.length) throw new Error('No completed reports');
    const scenes = [...new Set(reports.map(r => r.scene.id))], rows = [];
    await sequence(scenes, async (scene) => {
        await sequence(protocol.modes, async (mode) => {
            const trials = reports.filter(r => r.scene.id === scene && r.mode === mode);
            if (trials.length !== protocol.repeats || new Set(trials.map(r => r.round)).size !== protocol.repeats) throw new Error(`Incomplete trials for ${scene}/${mode}`);
            await sequence(trials.filter(t => t.passed), async (r) => {
                const reference = reports.find(b => b.scene.id === scene && b.mode === 'pc-full' && b.round === r.round);
                if (!reference?.passed) throw new Error('Missing full-quality reference');
                r.errors = [];
                await sequence(protocol.qualityFractions, async (_, i) => {
                    const a = await readFile(path.join(directory, String(reference.index), `quality-${i}.rgba`));
                    const b = await readFile(path.join(directory, String(r.index), `quality-${i}.rgba`));
                    if (a.length !== protocol.width * protocol.height * 4) throw new Error('Image resolution mismatch');
                    r.errors.push({ t: r.quality[i].t, referenceSha256: hash(a), candidateSha256: hash(b), ...imageError(a, b, r.scene.background) });
                });
            });
            const passed = trials.every(r => r.passed), row = { scene, mode, passed, trials: trials.map(r => r.index) };
            if (passed) {
                row.staticMs = stats(trials.flatMap(r => r.phases.static.samples.map(s => s.completeMs)));
                row.movingMs = stats(trials.flatMap(r => r.phases.moving.samples.map(s => s.completeMs)));
                row.movingPrepareMs = stats(trials.flatMap(r => r.phases.moving.samples.map(s => s.prepareMs)));
                row.interactiveFps = trials.map(r => r.interactive.rafFps);
                row.interactiveP95Ms = trials.map(r => r.interactive.p95IntervalMs);
                row.minPsnrDb = Math.min(...trials.flatMap(r => r.errors.map(e => (e.exact ? Infinity : e.psnrDb))));
                row.minForegroundPsnrDb = Math.min(...trials.flatMap(r => r.errors.map(e => (e.foregroundSquared === 0 ? Infinity : e.foregroundPsnrDb))));
                row.selectedSplats = trials.flatMap(r => r.quality.map(q => q.stats.selection?.activeSplats)).filter(Number.isFinite);
                row.staticReusesPresentation = mode === 'luma';
                row.perTrial = trials.map(r => ({ staticMedianMs: r.phases.static.medianMs, movingMedianMs: r.phases.moving.medianMs }));
            } else row.failures = trials.filter(r => !r.passed).map(r => ({ index: r.index, error: r.error, disposeError: r.disposeError }));
            rows.push(row);
        });
    });
    return { generatedAt: new Date().toISOString(),
        protocol,
        scenes: reports.filter(r => r.round === 0 && r.mode === 'pc-full').map(r => r.scene),
        reportCount: reports.length,
        passedCount: reports.filter(r => r.passed).length,
        rows,
        reports };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const directory = process.argv[2]; if (!directory) throw new Error('Usage: node summarize.mjs results/RUN [output-directory]');
    const summary = await summarize(directory, process.argv.includes('--benefit') ? BENEFIT_PROTOCOL : process.argv.includes('--main') ? MAIN_PROTOCOL : PROTOCOL);
    const output = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : directory;
    await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.table(summary.rows.map(r => ({ scene: r.scene,
        mode: r.mode,
        passed: r.passed,
        static: r.staticMs?.median.toFixed(2),
        moving: r.movingMs?.median.toFixed(2),
        p95: r.movingMs?.p95.toFixed(2),
        fps: r.interactiveFps?.map(f => f.toFixed(1)).join('/'),
        psnr: r.minPsnrDb?.toFixed(2),
        foreground: r.minForegroundPsnrDb?.toFixed(2) })));
}
