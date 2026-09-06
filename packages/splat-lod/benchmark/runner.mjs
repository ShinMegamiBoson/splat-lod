import { createAdapter } from './adapters.mjs';
import { PROTOCOL, cameraAt, quantile } from './protocol.mjs';
import { sequence, indices, until } from './sequence.mjs';
const status = document.querySelector('#status'), output = document.querySelector('#result'), button = document.querySelector('#start');
const query = new URLSearchParams(location.search), config = await (await fetch('/config.json')).json();
const pilot = query.get('pilot') === '1';
const selectedProtocol = config.protocol ?? PROTOCOL;
const protocol = pilot ? { ...selectedProtocol, warmup: 2, samples: 6, interactiveDurationMs: 200 } : selectedProtocol;
const cases = config.scenes.flatMap(scene => Array.from({ length: protocol.repeats }, (_, round) => (round % 2 ? [...protocol.modes].reverse() : protocol.modes).map(mode => ({ scene, mode, round })))).flat();
const index = Number(query.get('index') || 0), task = cases[index];
const run = query.get('run') || `${pilot ? 'pilot' : 'run'}-${Date.now()}`;
const raf = () => new Promise((resolve) => {
    requestAnimationFrame(resolve);
});
const progress = (text) => {
    status.textContent = `${index + 1}/${cases.length} · ${task.scene.name} · ${task.mode} · ${text}`;
};
const save = async (name, body) => {
    const r = await fetch(`/save/${run}/${index}/${name}`, { method: 'POST', body }); if (!r.ok) throw new Error(`Saving ${name}: ${await r.text()}`);
};
let invalid = null;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) invalid = 'Tab hidden during measurement';
});
const valid = (canvas) => {
    if (invalid) throw new Error(invalid); if (canvas.width !== protocol.width || canvas.height !== protocol.height) throw new Error('Drawing-buffer resolution changed');
    if (innerWidth !== protocol.cssWidth || innerHeight !== protocol.cssHeight) throw new Error('Use a 1280×720 browser viewport for this matched comparison');
};
progress('Ready to run. Keep this tab visible.'); button.disabled = false;
if (task.scene.attribution) {
    const credit = document.createElement('p'); credit.textContent = task.scene.attribution;
    for (const link of task.scene.attributionLinks ?? []) {
        const a = document.createElement('a'); a.href = link; a.textContent = ` ${link}`; credit.append(a);
    }
    document.querySelector('main').append(credit);
}

async function runCase() {
    button.disabled = true;
    const canvas = document.createElement('canvas'); canvas.width = protocol.width; canvas.height = protocol.height;
    document.querySelector('#stage').replaceChildren(canvas);
    const report = { run,
        index,
        pilot,
        protocol,
        libraryRevision: config.libraryRevision,
        evidence: config.evidence,
        scene: task.scene,
        mode: task.mode,
        round: task.round,
        startedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        devicePixelRatio,
        browserViewport: [innerWidth, innerHeight],
        phases: {},
        ...(protocol.version >= 4 ? { warmups: {} } : {}),
        quality: [],
        passed: false };
    let adapter, previewPixels;
    try {
        adapter = await createAdapter(task.mode, canvas, task.scene, progress);
        await adapter.prepare(cameraAt(task.scene, 0)); adapter.render(); await adapter.flush(); valid(canvas);
        await sequence(['static', 'moving'], async (phase) => {
            progress(`Warming ${phase} frames…`);
            const warmups = [];
            await sequence(indices(protocol.warmup), async (i) => {
                await raf();
                const start = performance.now();
                await adapter.prepare(cameraAt(task.scene, phase === 'static' ? 0 : i / protocol.warmup)); adapter.render(); await adapter.flush();
                if (protocol.version >= 4) warmups.push({ completeMs: performance.now() - start, path: adapter.trace?.() ?? null });
            });
            if (protocol.version >= 4) report.warmups[phase] = warmups;
            const samples = [];
            await sequence(indices(protocol.samples), async (i) => {
                await raf(); valid(canvas);
                const pose = cameraAt(task.scene, phase === 'static' ? 0 : i / (protocol.samples - 1));
                const start = performance.now(); await adapter.prepare(pose); const prepared = performance.now();
                adapter.render(); const submitted = performance.now(); await adapter.flush(); const completed = performance.now();
                samples.push({ prepareMs: prepared - start,
                    submitMs: submitted - prepared,
                    completeMs: completed - start,
                    ...(protocol.version >= 4 ? { path: adapter.trace?.() ?? null } : {}) });
                if (i % 15 === 0) progress(`Measuring ${phase}: ${i + 1}/${protocol.samples}`);
            });
            report.phases[phase] = { samples, medianMs: quantile(samples.map(s => s.completeMs), 0.5), p95Ms: quantile(samples.map(s => s.completeMs), 0.95) };
        });
        progress('Measuring interactive frame delivery (no per-frame completion wait)…');
        const interactive = [], duration = protocol.interactiveDurationMs;
        const start = await raf(); let previous = start;
        await until(() => previous - start >= duration, async () => {
            const now = await raf(); valid(canvas); const t = Math.min(1, (now - start) / duration);
            const prepareStart = performance.now(); await adapter.prepare(cameraAt(task.scene, t), true); adapter.render();
            interactive.push({ intervalMs: now - previous,
                submitMs: performance.now() - prepareStart,
                t,
                sortLag: adapter.sortLag?.() || null,
                ...(protocol.version >= 4 ? { path: adapter.trace?.() ?? null } : {}) });
            previous = now;
        });
        await adapter.flush();
        report.interactive = { frames: interactive,
            durationMs: previous - start,
            rafFps: interactive.length * 1000 / (previous - start),
            p95IntervalMs: quantile(interactive.map(s => s.intervalMs), 0.95),
            note: 'Animation-frame submissions, not proof of physical presentation or fresh asynchronous sorting' };
        // Quality sequence is separate from timing; all candidates use the same five ordered poses.
        await sequence(protocol.qualityFractions, async (t, i) => {
            progress(`Saving quality view ${i + 1}/${protocol.qualityFractions.length}…`);
            await adapter.prepare(cameraAt(task.scene, t)); adapter.render(); await adapter.flush();
            const pixels = await adapter.capture();
            if (i === 0) previewPixels = pixels;
            if (pixels.length !== protocol.width * protocol.height * 4) throw new Error('Capture resolution mismatch');
            let nonBackground = 0;
            for (let p = 0; p < pixels.length; p += 4) if ([0, 1, 2].some(c => Math.abs(pixels[p + c] - task.scene.background[c]) > 3)) nonBackground++;
            if (nonBackground < 100) throw new Error('Empty render');
            await save(`quality-${i}.rgba`, pixels); report.quality.push({ t, nonBackground, stats: await adapter.stats() });
        });
        report.passed = true;
    } catch (error) {
        report.error = { message: String(error.message || error), stack: error.stack };
    } finally {
        try {
            adapter?.dispose();
        } catch (error) {
            report.disposeError = String(error); report.passed = false;
        }
    }
    if (previewPixels) {
        const preview = document.createElement('canvas'); preview.width = protocol.width; preview.height = protocol.height;
        preview.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(previewPixels), protocol.width, protocol.height), 0, 0);
        document.querySelector('#stage').replaceChildren(preview);
    }
    await save('report.json', JSON.stringify(report, null, 2)); output.textContent = JSON.stringify(report, null, 2);
    progress(report.passed ? 'Completed and saved locally.' : `FAILED: ${report.error?.message || report.disposeError}`);
    if (!query.has('single') && index + 1 < cases.length && index < Number(query.get('last') || cases.length)) {
        // Replace, rather than append, so the browser cannot retain dozens of multi-GB
        // scene documents in back/forward history during a long comparison.
        query.set('run', run); query.set('index', String(index + 1)); location.replace(`/?${query}`);
    } else {
        button.textContent = 'Report saved';
    }
}
button.addEventListener('click', () => runCase().catch((error) => {
    status.textContent = `Unable to save benchmark: ${error.message}`;
}));
if (query.get('auto') === '1') button.click();
