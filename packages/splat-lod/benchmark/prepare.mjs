import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';
import { sequence } from './sequence.mjs';

// Local inputs only. No scan or derived bank is licensed for redistribution here.
const root = fileURLToPath(new URL('.', import.meta.url)), repo = path.resolve(root, '../../..');
const sourceConfig = process.argv[2]; if (!sourceConfig) throw new Error('Usage: node prepare.mjs /path/to/sources.json');
const sources = JSON.parse(await readFile(sourceConfig)), python = process.env.PYTHON || 'python3';
const assets = path.join(root, 'assets');
await mkdir(assets, { recursive: true });
const digest = file => new Promise((resolve, reject) => {
    const hash = createHash('sha256'), stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex')));
});
function execute(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed with ${result.status}`);
}
const mounts = {};
await sequence(SCENES, async (scene) => {
    const input = path.resolve(sources[scene.id]); await access(input);
    const decoded = path.join(assets, `${scene.id}.ply`);
    execute(path.join(root, 'node_modules/.bin/splat-transform'), [input, decoded]);
    const source = scene.id === 'ekotori' ? decoded : input;
    if (await digest(source) !== scene.sourceSha256) throw new Error(`${scene.id}: wrong source hash; do not silently benchmark a different scan`);
    const output = path.join(assets, scene.id);
    execute(python, [path.join(repo, 'scripts/splat-lod/build_lod.py'), source, output, '--cell-size', String(scene.cellSize)]);
    const luma = path.join(assets, `luma-${scene.id}`);
    execute(python, [path.join(root, 'export_luma.py'), decoded, luma]);
    mounts[scene.id] = output; mounts[`luma-${scene.id}`] = luma;
});
await writeFile(path.join(root, 'config.local.json'), `${JSON.stringify({ bundle: '../build/index.js', mounts }, null, 2)}\n`, { flag: 'wx' });
console.log('Prepared all three entire scans. Run npm run build && npm run serve.');
