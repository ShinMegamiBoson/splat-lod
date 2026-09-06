import defaults from './cube-policy-defaults.json' with { type: 'json' };
import { validateCubePartition } from './cube-policy.js';

export function validateManifest(manifest) {
    const m = manifest;
    if (m?.complete !== true || m.version !== defaults.version || !Number.isSafeInteger(m.sourceCount) || m.sourceCount < 2 || m.sourceCount > 0xffffffff) {
        throw new Error('Expected a completed version-6 cube LOD manifest');
    }
    const p = m.policy;
    if (![0, 3].includes(m.shBands ?? 3)) throw new Error('Expected SH0 or SH3 banks; coefficients must not be dropped');
    if (!p || p.version !== defaults.version || !Number.isFinite(p.cellSize) || p.cellSize <= 0 || !Number.isFinite(p.hysteresis) || p.hysteresis < 0 || p.hysteresis >= 1 || p.levels?.length !== defaults.levels.length) {
        throw new Error('Invalid cube LOD policy');
    }
    for (const [i, level] of p.levels.entries()) {
        if (level.id !== i || level.span !== defaults.levels[i].span || level.maxPixels !== defaults.levels[i].maxPixels) {
            throw new Error('Unsupported cube LOD level definition');
        }
    }
    if (typeof m.source !== 'string' || !m.source || m.levels?.length !== 3 || !m.files || !Number.isSafeInteger(m.chunkCount) || m.chunkCount < 1) {
        throw new Error('Incomplete source or LOD bank manifest');
    }
    for (const [i, level] of m.levels.entries()) {
        if (level.id !== i + 1 || level.span !== p.levels[i + 1].span || !Number.isSafeInteger(level.splats) || level.splats < 1 || level.splats > m.sourceCount || typeof level.file !== 'string' || !level.file.endsWith('.ply')) {
            throw new Error('Expected three nonempty, ordered PLY replacement banks');
        }
        validateDigest(level);
    }
    const names = [m.sourceOrder, 'source-offsets.u32', 'coordinates.i32', 'cube.bounds.f32', 'cube.draw-bounds.f32', ...m.levels.map(l => l.offsets)];
    if (new Set(names).size !== names.length) throw new Error('Duplicate metadata files');
    for (const name of names) {
        if (typeof name !== 'string' || !name || !m.files[name]) throw new Error('Missing cube metadata file');
        validateDigest(m.files[name]);
    }
    return m;
}

function validateDigest(info) {
    if (!Number.isSafeInteger(info?.bytes) || info.bytes < 1 || !/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error('Invalid asset length or SHA-256');
}

export async function checkedBytes(url, info, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${url}`);
    const bytes = await response.arrayBuffer();
    if (info) {
        if (info.bytes != null && bytes.byteLength !== info.bytes) throw new Error(`Asset length mismatch: ${url}`);
        if (info.sha256) {
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
            if (digest !== info.sha256) throw new Error(`Asset SHA-256 mismatch: ${url}`);
        }
    }
    return bytes;
}

export async function loadManifest(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
    const manifest = validateManifest(await response.json());
    const data = {};
    const names = [manifest.sourceOrder, 'source-offsets.u32', 'coordinates.i32', 'cube.bounds.f32', 'cube.draw-bounds.f32', ...manifest.levels.map(l => l.offsets)];
    await Promise.all(names.map(async (name) => {
        data[name] = await checkedBytes(new URL(name, url), manifest.files[name], signal);
    }));
    const sourceOrder = new Uint32Array(data[manifest.sourceOrder]);
    const regions = {
        policy: manifest.policy,
        offsets: [new Uint32Array(data['source-offsets.u32']), ...manifest.levels.map(l => new Uint32Array(data[l.offsets]))],
        coordinates: new Int32Array(data['coordinates.i32']),
        bounds: new Float32Array(data['cube.bounds.f32']),
        drawBounds: new Float32Array(data['cube.draw-bounds.f32'])
    };
    const ownership = validateCubePartition(sourceOrder, regions, manifest.sourceCount);
    if (ownership.chunkCount !== manifest.chunkCount || manifest.levels.some(l => l.splats !== regions.offsets[l.id].at(-1))) throw new Error('Manifest and cube ranges disagree');
    return { manifest, sourceOrder, regions, ownership };
}
