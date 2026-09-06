import { readFileSync, readdirSync } from 'node:fs';

import { expect } from 'chai';

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
    it('places current measurements and the tail-latency regression in the README lead', function () {
        const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8'), s = json('summary.json');
        expect(readme.indexOf('## Multi-scene benchmarks')).to.be.lessThan(readme.indexOf('npm install'));
        for (const r of s.rows.filter(r => r.mode !== 'ours-source')) expect(readme).to.include(`${r.movingMs.median.toFixed(2)} ms`);
        const shop = s.rows.find(r => r.scene === 'ekotori' && r.mode === 'ours-lod');
        expect(readme).to.include(`${shop.movingMs.p95.toFixed(2)} ms`);
        expect(readme).to.include('No clean win over PlayCanvas defaults yet');
    });
});
