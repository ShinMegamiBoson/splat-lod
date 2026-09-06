import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { assertPublicData } from './publication-privacy.mjs';
import { sequence } from './sequence.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const inputs = [
    { id: 'rocca', hash: 'abdf12c6', name: 'Rocca di Montecatini Alto', creator: 'enryt', expectedCount: 7049716, shBands: 3 },
    { id: 'wat-paknam', hash: '905ec260', name: 'Wat Paknam Bhasicaroen', creator: 'ethan3111', expectedCount: 8845461, shBands: 0 },
    { id: 'lcc2rock', hash: '157bad1d', name: 'LCC2Rock', creator: 'kumar3ar', expectedCount: 12219582, shBands: 0 }
];
const execute = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw result.error || new Error(`Preparation failed (${result.status})`);
};
const exists = async (file) => {
    try {
        await access(file); return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false; throw error;
    }
};
const python = process.env.PYTHON || 'python3', scenes = [], mounts = {};
await mkdir(path.join(root, 'assets/large-20260906'), { recursive: true });
await sequence(inputs, async (input) => {
    const viewer = await (await fetch(`https://superspl.at/s?id=${input.hash}`)).text();
    const scripts = [...viewer.matchAll(/<script[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/g)];
    const bootstrap = scripts.map(m => JSON.parse(m[1])).find(s => s.contentUrl);
    assert(bootstrap?.settings?.cameras?.[0]?.initial, 'Missing source camera');
    const page = await (await fetch(`https://superspl.at/scene/${input.hash}`)).text();
    assert(page.includes('https://creativecommons.org/licenses/by/4.0/'), 'Input must remain CC-BY');
    const metadataBytes = Buffer.from(await (await fetch(bootstrap.contentUrl)).arrayBuffer());
    const metadata = JSON.parse(metadataBytes);
    assert.equal(metadata.counts?.[0] ?? metadata.count, input.expectedCount);
    let environmentCount = 0;
    if (metadata.environment) environmentCount = (await (await fetch(new URL(metadata.environment, bootstrap.contentUrl))).json()).count;
    const asset = path.join(root, 'assets/large-20260906', input.id);
    await mkdir(asset, { recursive: true });
    const source = path.join(asset, 'source.ply'), lod = path.join(asset, 'lod'), luma = path.join(asset, 'luma');
    const transform = path.join(root, 'node_modules/.bin/splat-transform');
    const sourceOnly = environmentCount ? path.join(asset, 'source-only.ply') : source;
    if (!await exists(sourceOnly)) execute(transform, [bootstrap.contentUrl, ...(metadata.counts ? ['--select-lod', '0'] : []), sourceOnly]);
    // The streamed reader does not include the separate environment. Concatenate
    // it explicitly instead of silently dropping those splats from every test.
    if (environmentCount && !await exists(source)) execute(transform, [sourceOnly, new URL(metadata.environment, bootstrap.contentUrl).href, source]);
    if (!await exists(path.join(lod, 'manifest.json'))) execute(python, [path.join(root, 'prepare_large_lod.py'), source, lod]);
    const manifest = JSON.parse(await readFile(path.join(lod, 'manifest.json')));
    assert(manifest.complete);
    assert.equal(manifest.sourceCount, input.expectedCount + environmentCount);
    assert.equal(manifest.shBands ?? 3, input.shBands);
    if (!await exists(path.join(luma, 'manifest.json'))) execute(python, [path.join(root, 'export_luma.py'), source, luma]);
    const initial = bootstrap.settings.cameras[0].initial;
    const sourceVector = v => [-v[0], -v[1], v[2]];
    const scene = { id: input.id,
        name: input.name,
        count: manifest.sourceCount,
        shBands: input.shBands,
        cellSize: manifest.policy.cellSize,
        cubeSizeRule: 'max-axis-central-98-percent-extent / 32',
        source: `/data/${input.id}/${manifest.source}`,
        manifest: `/data/${input.id}/manifest.json`,
        luma: `/data/luma-${input.id}/manifest.json`,
        sourceSha256: manifest.sourceSha256,
        sceneUrl: `https://superspl.at/scene/${input.hash}`,
        creator: input.creator,
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        publishedUrl: bootstrap.contentUrl,
        publishedMetadataSha256: createHash('sha256').update(metadataBytes).digest('hex'),
        sourceDescription: metadata.counts ? `Entire published LOD 0 plus ${environmentCount} environment splats; no extra filtering.` : 'Entire published source; no filtering or extra parameter quantization.',
        environmentCount,
        background: [0, 0, 0],
        motionScale: manifest.policy.cellSize,
        camera: { position: sourceVector(initial.position),
            target: sourceVector(initial.target),
            up: [0, -1, 0],
            fovDegrees: 2 * Math.atan(Math.tan(initial.fov * Math.PI / 360) / (16 / 9)) * 180 / Math.PI,
            near: 0.05,
            far: 10000 } };
    assertPublicData(scene);
    scenes.push(scene); mounts[input.id] = lod; mounts[`luma-${input.id}`] = luma;
    console.log(JSON.stringify({ scene: scene.id, count: scene.count, shBands: scene.shBands, cellSize: scene.cellSize }));
});
const save = (file, data) => writeFile(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`);
await save('config-large.local.json', { bundle: '../build/index.js', mounts, scenes });
await save('large-scenes.json', scenes);
