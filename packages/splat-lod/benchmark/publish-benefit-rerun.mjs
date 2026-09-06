import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { BENEFIT_PROTOCOL } from './benefit-protocol.mjs';

// Publish numeric evidence only. Keep the first cohort and released runtime unchanged.
assert.equal(process.argv.length, 3, 'Pass the verified benefit-gate-20260906-r2 directory');
const input = path.resolve(process.argv[2]);
const raw = await readFile(path.join(input, 'results.json'));
const summary = JSON.parse(raw);
const verification = JSON.parse(await readFile(path.join(input, 'verification.json')));
const comparison = JSON.parse(await readFile(path.join(input, 'comparison.json')));
assert(verification.passed);
assert.equal(verification.summarySha256, createHash('sha256').update(raw).digest('hex'));
assert.deepEqual(comparison.verification, verification);
assert.deepEqual(summary.protocol, BENEFIT_PROTOCOL);
assert.equal(summary.reportCount, 32);
assert.equal(summary.passedCount, 32);
assert.equal(summary.reports.length, 32);
assert(summary.reports.every(r => r.run === 'benefit-gate-20260906-r2' && r.passed && !r.pilot));

const destination = new URL('./measurements/2026-09-06-benefit-rerun/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('results.json.gz', destination), gzipSync(raw, { level: 9 }));
await Promise.all(['comparison.json', 'verification.json', 'environment-after.json'].map(async (name) => {
    const data = await readFile(path.join(input, name));
    await writeFile(new URL(name, destination), data);
}));
console.log('Published the complete verified rerun without scan assets or captures.');
