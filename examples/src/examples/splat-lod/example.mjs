import { runProof } from './proof.mjs';

// The example server serves the built, independently installable bundle here.
const { createSplatRenderer } = await import(new URL('/bundle.js', location.href));

const $ = id => document.getElementById(id);
const canvas = $('view'), keys = new Set(), controls = ['reset', 'back', 'mode', 'lod', 'colors', 'check', 'adaptive'];
let renderer, config, frame, busy = false, lastTime = 0, lastStats = 0, reading = false, dragging = false;
let position, yaw = 0, pitch = 0;
const status = (text) => {
    $('status').textContent = text;
};
const disable = (value) => {
    controls.forEach((id) => {
        $(id).disabled = value;
    });
};
function failed(error) {
    busy = true; status(`Cannot render: ${error.message}`); $('retry').hidden = false; disable(true);
}
function forward() {
    return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}
function applyPose() {
    renderer.setCamera({ position, target: forward().map((v, i) => v + position[i]) });
}
function reset() {
    position = [...config.camera.position];
    const d = config.camera.target.map((v, i) => v - position[i]);
    yaw = Math.atan2(d[0], -d[2]); pitch = Math.atan2(d[1], Math.hypot(d[0], d[2])); applyPose();
}
function resize() {
    if (renderer && !busy) renderer.resize(innerWidth, innerHeight, devicePixelRatio);
}
function draw(time) {
    frame = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (time - lastTime) / 1000); lastTime = time;
    if (!renderer || busy) return;
    const speed = (config.movementSpeed || 1) * dt * (keys.has('Shift') ? 3 : 1), f = forward(), r = [Math.cos(yaw), 0, Math.sin(yaw)];
    let changed = false;
    for (const [key, vector, sign] of [['w', f, 1], ['s', f, -1], ['d', r, 1], ['a', r, -1]]) {
        if (keys.has(key)) {
            position = position.map((v, i) => v + vector[i] * speed * sign); changed = true;
        }
    }
    try {
        if (changed) applyPose();
        renderer.render();
        if (!reading && time - lastStats > 1000) {
            reading = true; lastStats = time;
            renderer.readStats().then((s) => {
                if (s) $('stats').textContent = `${s.activeSplats.toLocaleString()} splats · ${s.viewport.join(' × ')} pixels · cubes by detail: ${s.chunksByLevel.join(' / ')}`;
                const p = renderer.getInfo().performance;
                $('performance').textContent = p.probing ? 'Comparing render speed with brief timing probes…' :
                    p.reason === 'timing-unavailable' ? 'Using original splats: GPU timing is unavailable.' :
                        p.reason === 'display-override' ? 'Using your selected display mode.' :
                            !p.enabled ? 'Fixed screen-size LOD; speed selection is off.' :
                                p.path === 'lod' ? 'Using LOD: it measured faster.' : 'Using original splats: no clear LOD speed gain.';
            }).catch(failed).finally(() => {
                reading = false;
            });
        }
    } catch (error) {
        failed(error);
    }
}
canvas.addEventListener('pointerdown', (event) => {
    if (!busy) {
        dragging = true; canvas.setPointerCapture(event.pointerId);
    }
});
canvas.addEventListener('pointerup', () => {
    dragging = false;
});
canvas.addEventListener('pointercancel', () => {
    dragging = false;
});
canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !renderer || busy) return;
    yaw += event.movementX * 0.002; pitch = Math.max(-1.5, Math.min(1.5, pitch - event.movementY * 0.002)); applyPose();
});
addEventListener('keydown', (e) => {
    if (!['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});
addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => {
    keys.clear(); dragging = false;
});
addEventListener('resize', resize);
addEventListener('pagehide', () => {
    cancelAnimationFrame(frame); if (!busy) renderer?.dispose();
});
$('retry').onclick = () => location.reload();
$('reset').onclick = reset;
$('back').onclick = () => {
    const f = forward(); position = position.map((v, i) => v - f[i] * (config.movementSpeed || 1)); applyPose();
};
$('mode').onchange = () => {
    renderer.setMode($('mode').value); status($('mode').value === 'lower-only' ? 'Only eligible reduced chunks are shown.' : 'Exploring the scene');
};
$('colors').onchange = () => renderer.setChunkColors($('colors').checked);
$('adaptive').onchange = () => renderer.setAdaptiveLod($('adaptive').checked);
$('lod').oninput = () => {
    const value = Number($('lod').value); renderer.setLodMultiplier(value); $('factor').textContent = `${value}×`;
};
$('check').onclick = async () => {
    busy = true; disable(true); status('Checking GPU selection and image stability…');
    try {
        const result = await runProof(renderer, config);
        $('proof').textContent = JSON.stringify(result, null, 2);
        $('proof').dataset.passed = String(result.passed);
        await fetch('/proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
        status(result.passed ? 'Renderer checks passed' : 'Renderer checks failed — inspect the results');
    } catch (error) {
        $('proof').textContent = error.stack; status('Renderer checks failed');
    } finally {
        busy = false; disable(false); reset();
    }
};
try {
    const response = await fetch('/config.json'); if (!response.ok) throw new Error('Cannot load demo configuration'); config = await response.json();
    const override = new URLSearchParams(location.search).get('manifest');
    if (override) config.manifestUrl = override;
    renderer = await createSplatRenderer({ ...config, canvas, onProgress: status, onError: failed });
    const initial = renderer.getInfo();
    $('adaptive').checked = initial.performance.enabled;
    $('lod').min = String(Math.min(1, initial.lodMultiplier));
    if (!Number.isInteger(initial.lodMultiplier)) $('lod').step = 'any';
    $('lod').value = String(initial.lodMultiplier);
    $('factor').textContent = `${initial.lodMultiplier}×`;
    reset(); disable(false); status('Exploring the scene'); document.body.dataset.ready = 'true';
    frame = requestAnimationFrame(draw);
} catch (error) {
    failed(error);
}
