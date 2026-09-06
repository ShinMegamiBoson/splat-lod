import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sequence, indices } from './sequence.mjs';

// Deterministic scene-wise selection, never picking the faster of repeated attempts.
// Every object case comes from the object batch; every shop case is a fresh-tab run.
const [objects, shop, destination] = process.argv.slice(2);
if (!objects || !shop || !destination) throw new Error('Usage: node combine-runs.mjs OBJECT-RUN SHOP-RUN NEW-DESTINATION');
await mkdir(destination);
const mapping = [];
await sequence(indices(36), async (index) => {
    const directory = path.resolve(index < 24 ? objects : shop, String(index));
    const report = JSON.parse(await readFile(path.join(directory, 'report.json')));
    if (!report.passed || report.index !== index || (report.scene.id === 'ekotori') !== (index >= 24)) throw new Error(`Invalid selected case ${index}`);
    await symlink(directory, path.join(destination, String(index)), 'dir');
    mapping.push({ index,
        originalRun: report.run,
        scene: report.scene.id,
        mode: report.mode,
        round: report.round,
        isolation: index < 24 ? 'Fresh document, replaced history, same tab' : 'Fresh tab, closed after this one case' });
});
await writeFile(path.join(destination, 'case-selection.json'), `${JSON.stringify(mapping, null, 2)}\n`);
