import { readFileSync, readdirSync } from 'node:fs';

import { expect } from 'chai';

import { formatCrossRendererComparison } from '../../packages/splat-lod/benchmark/format-cross-renderer.mjs';
import { quantile } from '../../packages/splat-lod/benchmark/protocol.mjs';

const evidence = new URL('../../packages/splat-lod/benchmark/measurements/2026-09-05/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, evidence), 'utf8'));

describe('published multi-scene benchmark evidence', function () {
    it('retains all 36 qualified cases and 6480 timed frames', function () {
        const s = json('summary.json'), files = readdirSync(new URL('runs/', evidence));
        expect(s.rows).to.have.length(18); expect(files).to.have.length(36);
        expect(s.passedCount).to.equal(36);
        let count = 0;
        for (const name of files) {
            const r = json(`runs/${name}`);
            expect(r.passed).to.equal(true); expect(r.pilot).to.equal(false);
            expect(r.browserViewport).to.deep.equal([1280, 720]);
            expect(r.evidence).to.deep.equal(s.evidence);
            expect(r.errors).to.have.length(5);
            for (const phase of ['static', 'moving']) {
                expect(r.phases[phase].samples).to.have.length(90); count += r.phases[phase].samples.length;
            }
        }
        expect(count).to.equal(6480);
        expect(json('verification.json').qualityPairsChecked).to.equal(180);
    });
    it('keeps deterministic scene-wise selection and the failed setup attempts', function () {
        const selected = json('case-selection.json');
        expect(selected).to.have.length(36);
        for (const r of selected) expect(r.originalRun).to.equal(r.index < 24 ? 'multi-scene-20260906-r2' : 'multi-scene-20260906-r4');
        expect(json('development-attempts.json').some(r => !r.passed && r.error.includes('allocation failed'))).to.equal(true);
    });
    it('publishes same-cohort speed and quality for every compared renderer, with losses and versions', function () {
        const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8'), s = json('summary.json');
        expect(readme.indexOf('## Multi-scene benchmarks')).to.be.lessThan(readme.indexOf('npm install'));
        const lead = readme.split('<!-- multi-scene-benchmark:start -->')[1].split('<!-- multi-scene-benchmark:end -->')[0].trim();
        expect(lead).to.equal(formatCrossRendererComparison(s));
        // The new same-runtime cohort leads the page; historical results remain
        // intact in a clearly labeled disclosure instead of competing with it.
        expect(readme.indexOf('<!-- large-benchmark:start -->')).to.be.lessThan(readme.indexOf('<details>'));
        expect(readme.indexOf('Earlier scenes and renderer versions')).to.be.lessThan(readme.indexOf('<!-- multi-scene-benchmark:start -->'));
        const reports = readdirSync(new URL('runs/', evidence)).map(name => json(`runs/${name}`));
        for (const row of s.rows.filter(r => r.mode !== 'ours-source')) {
            const trials = reports.filter(r => r.scene.id === row.scene && r.mode === row.mode);
            expect(trials).to.have.length(2);
            const frames = trials.flatMap(r => r.phases.moving.samples.map(sample => sample.completeMs));
            expect(quantile(frames, 0.5)).to.equal(row.movingMs.median);
            expect(lead).to.include(`${row.movingMs.median.toFixed(2)} ms`);
            if (row.mode !== 'pc-full') {
                const scores = trials.flatMap(r => r.errors.map(e => 10 * Math.log10(255 ** 2 * e.foregroundPixels * 3 / e.foregroundSquared)));
                expect(Math.min(...scores)).to.be.closeTo(row.minForegroundPsnrDb, 1e-10);
                expect(lead).to.include(`${row.minForegroundPsnrDb.toFixed(2)} dB`);
            }
        }
        const shop = s.rows.find(r => r.scene === 'ekotori' && r.mode === 'ours-lod');
        expect(lead).to.include(`${shop.movingMs.p95.toFixed(2)} ms`);
        expect(lead).to.include('v0.1 is slower than PC defaults on the bee and cicada');
        expect(lead).to.include('not new v0.3 measurements');
        expect(lead).to.include('normal asynchronous loop is timed separately');
        for (const version of ['v0.1.0', 'PlayCanvas 2.22.0', 'Spark 2.1.0', 'luma.gl 9.4.0']) expect(lead).to.include(version);
    });
});
