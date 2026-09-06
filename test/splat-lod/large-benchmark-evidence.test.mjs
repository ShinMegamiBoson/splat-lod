import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

import { formatLargeLead, largeRankings } from '../../packages/splat-lod/benchmark/format-large-report.mjs';
import { LARGE_PROTOCOL } from '../../packages/splat-lod/benchmark/large-protocol.mjs';
import { quantile } from '../../packages/splat-lod/benchmark/protocol.mjs';

const root = new URL('../../', import.meta.url);
const directory = new URL('packages/splat-lod/benchmark/measurements/2026-09-06-large/', root);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

describe('Published large-scene comparison', function () {
    it('retains every matched trial, exact input count, quality error and runtime hash', async function () {
        const raw = gunzipSync(await readFile(new URL('results.json.gz', directory)));
        const full = JSON.parse(raw);
        const summary = JSON.parse(await readFile(new URL('summary.json', directory)));
        const proof = JSON.parse(await readFile(new URL('verification.json', directory)));
        assert.deepEqual(full.protocol, LARGE_PROTOCOL);
        assert.equal(full.reportCount, 36);
        assert.equal(full.reports.length, 36);
        assert.equal(full.rows.length, 18);
        assert.deepEqual(full.scenes.map(s => s.count), [7049716, 8845461, 12245931]);
        assert.deepEqual(full.scenes.map(s => s.shBands), [3, 0, 0]);
        assert.equal(full.scenes[2].environmentCount, 26349);
        assert.equal(summary.uncompressedResultsSha256, sha(raw));
        assert.equal(proof.summarySha256, sha(raw));
        assert(proof.passed);
        assert.equal(proof.qualityPairsChecked, full.passedCount * 5);
        assert.equal(proof.timedFramesChecked, full.passedCount * 180);
        assert.equal(proof.warmupFramesChecked, full.passedCount * 128);
        const referenceHash = '6411f9e357dd3e07b469c2d2b6231ab8d0a898391feb89451d3aee68b3a12213';
        for (const report of full.reports) {
            assert(!report.pilot);
            assert.deepEqual(report.evidence, summary.evidence);
            assert.equal(report.evidence.librarySha256, referenceHash);
            assert.deepEqual(report.browserViewport, [1280, 720]);
            if (!report.passed) {
                assert(report.error || report.disposeError);
                continue;
            }
            for (const phase of ['static', 'moving']) {
                assert.equal(report.phases[phase].samples.length, 90);
                assert.equal(report.warmups[phase].length, 64);
            }
            assert.equal(report.errors.length, 5);
            for (const error of report.errors) {
                assert.equal(error.pixels, 2560 * 1440);
                assert(error.foregroundPixels > 100);
                if (error.foregroundSquared) assert(Math.abs(error.foregroundPsnrDb - 10 * Math.log10(255 ** 2 * error.foregroundPixels * 3 / error.foregroundSquared)) < 1e-9);
            }
        }
        for (const row of summary.rows) {
            const trials = full.reports.filter(r => r.scene.id === row.scene && r.mode === row.mode);
            assert.equal(trials.length, 2);
            assert.deepEqual(trials.map(r => r.round), [0, 1]);
            assert.equal(row.passed, trials.every(r => r.passed));
            if (row.passed) assert.equal(row.movingMs.median, quantile(trials.flatMap(r => r.phases.moving.samples.map(s => s.completeMs)), 0.5));
        }
        assert.deepEqual(summary.rankings, largeRankings(full));
        summary.rankings.forEach((rank, i) => {
            assert.deepEqual(rank.winners, proof.rankingChecks[i].winners);
            assert.equal(rank.speedup, proof.rankingChecks[i].speedup);
            assert.equal(rank.complete, proof.rankingChecks[i].complete);
        });
    });

    it('derives visible winners, runner-up speedups and separate fixed-LOD quality from the same run', async function () {
        const summary = JSON.parse(await readFile(new URL('summary.json', directory)));
        const readme = await readFile(new URL('README.md', root), 'utf8');
        const start = readme.indexOf('<!-- large-benchmark:start -->');
        const end = readme.indexOf('<!-- large-benchmark:end -->');
        assert(start > 0 && end > start);
        assert.equal(readme.slice(start + '<!-- large-benchmark:start -->'.length, end).trim(), formatLargeLead(summary));
        assert(start < readme.indexOf('<details>'));
        assert(start < readme.indexOf('<!-- benefit-rerun:start -->'));
        assert(readme.startsWith('# Splat LOD\n'));
        const lead = formatLargeLead(summary);
        assert(lead.includes('Over next-best'));
        assert(lead.includes('not interactive FPS'));
        assert(lead.includes('Quality captures can use a different path from the timing frames'));
        assert(lead.includes('original splats for all 540 measured moving frames'));
        assert(lead.includes('not an LOD speedup'));
        assert(lead.includes('not a quality-matched race'));
        assert(lead.includes('Fixed LOD minimum foreground PSNR'));
    });
});
