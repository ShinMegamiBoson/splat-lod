import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { expect } from 'chai';

import { BENEFIT_PROTOCOL } from '../../packages/splat-lod/benchmark/benefit-protocol.mjs';

const root = new URL('../../packages/splat-lod/benchmark/measurements/2026-09-06-benefit-rerun/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));

describe('latest benchmark positioning', function () {
    it('ties the scoped headline to all verified cases, including probe frames', function () {
        const bytes = gunzipSync(readFileSync(new URL('results.json.gz', root)));
        const summary = JSON.parse(bytes);
        const verification = json('verification.json');
        const comparison = json('comparison.json');
        expect(verification.passed).to.equal(true);
        expect(createHash('sha256').update(bytes).digest('hex')).to.equal(verification.summarySha256);
        expect(comparison.verification).to.deep.equal(verification);
        expect(summary.protocol).to.deep.equal(BENEFIT_PROTOCOL);
        expect(summary.reportCount).to.equal(32);
        expect(summary.passedCount).to.equal(32);
        expect(summary.reports.map(r => r.index).sort((a, b) => a - b)).to.deep.equal(Array.from({ length: 32 }, (_, i) => i));

        const installed = JSON.parse(readFileSync(new URL('../../packages/splat-lod/VALIDATION-v0.3.json', import.meta.url)));
        let timed = 0, warmups = 0, quality = 0;
        for (const r of summary.reports) {
            expect(r.run).to.equal('benefit-gate-20260906-r2');
            expect(r.passed && !r.pilot).to.equal(true);
            expect(r.evidence).to.deep.equal(summary.reports[0].evidence);
            expect(r.evidence.librarySha256).to.equal(installed.runtimeSha256);
            expect(r.quality).to.have.length(5);
            expect(r.errors).to.have.length(5);
            quality += r.quality.length;
            for (const phase of ['static', 'moving']) {
                expect(r.phases[phase].samples).to.have.length(90);
                expect(r.warmups[phase]).to.have.length(64);
                timed += r.phases[phase].samples.length;
                warmups += r.warmups[phase].length;
            }
        }
        expect(timed).to.equal(5760);
        expect(warmups).to.equal(4096);
        expect(quality).to.equal(160);

        const lead = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('<!-- benefit-rerun:start -->')[1].split('<!-- benefit-rerun:end -->')[0];
        const report = readFileSync(new URL('README.md', root), 'utf8');
        const names = { pc: 'pc-full', direct: 'ours-direct', fixed: 'ours-fixed', auto: 'ours-auto' };
        expect(comparison.rows).to.have.length(4);
        for (const row of comparison.rows) {
            for (const [name, mode] of Object.entries(names)) {
                const trials = summary.reports.filter(r => r.scene.id === row.scene && r.mode === mode);
                expect(trials.map(r => r.round).sort()).to.deep.equal([0, 1]);
                const samples = trials.flatMap(r => r.phases.moving.samples);
                const mean = samples.reduce((total, s) => total + s.completeMs, 0) / samples.length;
                expect(row.movingMs[name].mean).to.be.closeTo(mean, 1e-10);
                expect(report).to.include(`${mean.toFixed(2)} ms`);
            }
            const speedup = row.movingMs.pc.mean / row.movingMs.auto.mean;
            expect(row.speedupVsPcMean).to.equal(speedup);
            expect(lead).to.include(`| ${row.movingMs.pc.mean.toFixed(2)} ms | ${row.movingMs.auto.mean.toFixed(2)} ms | ${speedup.toFixed(2)}× |`);
            const fixed = summary.rows.find(r => r.scene === row.scene && r.mode === 'ours-fixed');
            expect(row.fixedLodMinForegroundPsnrDb).to.equal(fixed.minForegroundPsnrDb);
            expect(report).to.include(`${fixed.minForegroundPsnrDb.toFixed(2)} dB`);
        }
        const ratios = comparison.rows.map(r => r.speedupVsPcMean);
        expect(lead).to.include(`${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}× faster than PlayCanvas full quality in our moving-camera tests`);
        expect(lead).to.include('Apple M5 Max, 2560×1440');
        expect(lead).to.include('LOD trades image quality for speed');
        expect(lead).to.include('not stock defaults');
        expect(lead).to.include('other renderers were not rerun');
        expect(report).to.include('Do not pair the higher PSNR');
        expect(report).to.include('Power state was not tracked during either cohort');
    });
});
