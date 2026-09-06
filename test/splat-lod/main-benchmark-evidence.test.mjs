import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import { expect } from 'chai';

import { MAIN_PROTOCOL, OPTIMIZATION_SETTINGS } from '../../packages/splat-lod/benchmark/main-protocol.mjs';
import { renderSettings } from '../../src/framework/splat-lod/render-settings.js';

const root = new URL('../../packages/splat-lod/benchmark/measurements/2026-09-06/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));

describe('same-main large-scene benchmark evidence', function () {
    it('retains all 56 runs, full source degrees, matching builds and 10080 frames', function () {
        const summary = json('summary.json');
        expect(summary.protocol).to.deep.equal(MAIN_PROTOCOL);
        const reports = readdirSync(new URL('runs/', root)).map(name => json(`runs/${name}`)).sort((a, b) => a.index - b.index);
        expect(reports).to.have.length(56);
        let frames = 0;
        for (const r of reports) {
            expect(r.passed).to.equal(true); expect(r.pilot).to.equal(false);
            expect(r.run).to.equal('pc-main-20260906-r2');
            expect(r.evidence).to.deep.equal(summary.evidence);
            expect(r.browserViewport).to.deep.equal([1280, 720]);
            expect(r.devicePixelRatio).to.equal(summary.hardware.devicePixelRatio);
            expect(r.quality).to.have.length(5); expect(r.errors).to.have.length(5);
            if (r.mode.startsWith('ours-')) {
                for (const q of r.quality) {
                    expect(q.stats.sourceCount).to.equal(r.scene.count);
                    expect(q.stats.shBands).to.equal(r.scene.shBands ?? 3);
                    expect(q.stats.renderSettings).to.deep.equal(renderSettings(OPTIMIZATION_SETTINGS[r.mode]));
                    expect(q.stats.globalDepthSort).to.equal(true);
                    expect(q.stats.sourceHashVerified).to.equal(true);
                    expect(q.stats.viewport).to.deep.equal([2560, 1440]);
                }
            }
            for (const phase of ['static', 'moving']) {
                expect(r.phases[phase].samples).to.have.length(90);
                frames += r.phases[phase].samples.length;
            }
        }
        expect(frames).to.equal(10080);
        // Reconstruct the independently verified, pre-publication summary exactly.
        const { hardware, evidence, ...original } = summary;
        expect(hardware.physicalRenderSize).to.deep.equal([2560, 1440]);
        expect(evidence.upstreamRevision).to.equal(MAIN_PROTOCOL.engineRevision);
        const hash = createHash('sha256').update(`${JSON.stringify({ ...original, reports }, null, 2)}\n`).digest('hex');
        const verification = json('verification.json');
        expect(hash).to.equal(verification.summarySha256);
        expect(verification.qualityPairsChecked).to.equal(280);
        expect(verification.timingRowsChecked).to.equal(28);
        const installed = JSON.parse(readFileSync(new URL('../../packages/splat-lod/VALIDATION-v0.2.json', import.meta.url)));
        expect(installed.runtimeSha256).to.equal(evidence.librarySha256);
        expect(installed.syntheticSH0.checks).to.have.length(6);
        expect(installed.syntheticSH0.checks.every(c => c.passed && c.idMismatches === 0 && c.decisionMismatches === 0)).to.equal(true);
    });

    it('keeps quality-failing optimizations opt-in and derives the lead from current data', function () {
        expect(json('optimization-decision.json').defaultChanged).to.equal(false);
        expect(renderSettings().profile).to.equal('exact');
        expect(renderSettings().shMode).to.equal('visible');
        expect(json('attempts.json')[0].included).to.equal(false);
        const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
        const lead = readme.split('<!-- main-benchmark:start -->')[1].split('<!-- main-benchmark:end -->')[0];
        const summary = json('summary.json');
        for (const r of summary.rows.filter(r => ['ours-lod', 'pc-default'].includes(r.mode))) {
            expect(lead).to.include(`${r.movingMs.median.toFixed(2)} / ${r.movingMs.p95.toFixed(2)} ms`);
            expect(lead).to.include(r.minForegroundPsnrDb.toFixed(2));
        }
        expect(lead).to.include('not two independent scenes');
        expect(lead).to.include('slower on the bee');
    });
});
