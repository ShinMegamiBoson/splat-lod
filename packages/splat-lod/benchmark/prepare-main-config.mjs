import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';
import { sequence } from './sequence.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'config.local.json')));
const scenes = ['bee', 'ekotori'].map(id => SCENES.find(s => s.id === id));
const metadata = 'https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json';
await sequence([['16m', 16184440, 4], ['32m', 32368879, 3]], async ([label, count, publishedLevel]) => {
    const id = `lublin-${label}`, dir = path.join(root, 'assets/lublin-main', `${id}-lod`);
    let manifest;
    try {
        manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json')));
    } catch (error) {
        if (error.code === 'ENOENT' && process.argv.includes('--selection-only')) return;
        throw error;
    }
    if (manifest.sourceCount !== count || manifest.shBands !== 0 || !manifest.complete) throw new Error(`Incomplete or incorrect ${id} input`);
    config.mounts[id] = dir;
    scenes.push({ id,
        name: `Lublin city · published LOD ${publishedLevel}`,
        count,
        shBands: 0,
        cellSize: manifest.policy.cellSize,
        source: `/data/${id}/${manifest.source}`,
        manifest: `/data/${id}/manifest.json`,
        sourceSha256: manifest.sourceSha256,
        sceneUrl: metadata,
        sourceDescription: `Entire published LOD ${publishedLevel}, not the 258,951,032-splat original; no extra point filtering.`,
        creator: 'Andrii Shramko, Teleportour',
        attribution: '3D scanning data created and provided by Andrii Shramko, Teleportour.',
        attributionLinks: ['https://www.linkedin.com/in/andrii-shramko/', 'https://www.linkedin.com/company/teleportour/', 'https://teleportour.com'],
        background: [8, 8, 8],
        motionScale: 10,
        camera: { position: [-87.42, -179.97, -14.23], target: [-86.547, -179.545, -14.486], up: [0, 0, 1], fovDegrees: 75, near: 0.1, far: 10000 } });
});
await writeFile(path.join(root, 'config-main.local.json'), `${JSON.stringify({ bundle: '../build/index.js', mounts: config.mounts, scenes }, null, 2)}\n`);
if (process.argv.includes('--freeze-scenes')) {
    if (scenes.length !== 4) throw new Error('Freeze requires both complete large inputs');
    const filename = path.join(root, 'main-scenes.json'), content = `${JSON.stringify(scenes, null, 2)}\n`;
    try {
        await writeFile(filename, content, { flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST' || await readFile(filename, 'utf8') !== content) throw error;
    }
}
console.log(scenes.map(s => `${s.id}: ${s.count.toLocaleString('en-US')}, SH${s.shBands ?? 3}`).join('\n'));
