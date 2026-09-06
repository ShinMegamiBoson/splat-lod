import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import { expect } from 'chai';

import { BENEFIT_PROTOCOL } from '../../packages/splat-lod/benchmark/benefit-protocol.mjs';
import { renderSettings } from '../../src/framework/splat-lod/render-settings.js';

const root = new URL('../../packages/splat-lod/benchmark/measurements/2026-09-06-benefit/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));

describe('automatic LOD benchmark evidence', function () {
    it('retains every frame, probe and quality path with matching settings and builds', function () {
        const summary = json('summary.json');
        expect(summary.protocol).to.deep.equal(BENEFIT_PROTOCOL);
        const reports = readdirSync(new URL('runs/', root)).map(n => json(`runs/${n}`)).sort((a, b) => a.index - b.index);
        expect(reports).to.have.length(32);
        let frames = 0, warmups = 0;
        for (const r of reports) {
            expect(r.passed && !r.pilot).to.equal(true);
            expect(r.evidence).to.deep.equal(summary.evidence);
            expect(r.quality).to.have.length(5); expect(r.errors).to.have.length(5);
            for (const phase of ['static', 'moving']) {
                expect(r.phases[phase].samples).to.have.length(90); frames += r.phases[phase].samples.length;
                expect(r.warmups[phase]).to.have.length(64); warmups += r.warmups[phase].length;
                if (r.mode.startsWith('ours-')) {
                    for (const s of r.phases[phase].samples) expect(['direct', 'lod']).to.include(s.path.path);
                }
            }
            if (r.mode.startsWith('ours-')) {
                for (const q of r.quality) {
                    expect(q.stats.renderSettings).to.deep.equal(renderSettings());
                    expect(q.stats.sourceCount).to.equal(r.scene.count);
                    expect(q.stats.shBands).to.equal(r.scene.shBands ?? 3);
                    expect(q.stats.viewport).to.deep.equal([2560, 1440]);
                    expect(q.stats.sourceHashVerified && q.stats.globalDepthSort).to.equal(true);
                }
            }
        }
        expect(frames).to.equal(5760); expect(warmups).to.equal(4096);
        const { hardware, evidence, ...original } = summary;
        expect(hardware.physicalRenderSize).to.deep.equal([2560, 1440]);
        expect(evidence.upstreamRevision).to.equal(BENEFIT_PROTOCOL.engineRevision);
        const verification = json('verification.json');
        expect(createHash('sha256').update(`${JSON.stringify({ ...original, reports }, null, 2)}\n`).digest('hex')).to.equal(verification.summarySha256);
        expect(verification.qualityPairsChecked).to.equal(160);
        expect(verification.directBypassTransitionsChecked).to.be.greaterThan(4000);
        const installed = JSON.parse(readFileSync(new URL('../../packages/splat-lod/VALIDATION-v0.3.json', import.meta.url), 'utf8'));
        expect(installed.runtimeSha256).to.equal(evidence.librarySha256);
        expect(installed.installedRuntimeMatchesTimedRuntime && installed.passed).to.equal(true);
        expect(installed.syntheticSH0.checks).to.have.length(6);
        expect(installed.syntheticSH0.checks.every(c => c.passed && c.idMismatches === 0 && c.decisionMismatches === 0)).to.equal(true);
        expect(installed.syntheticSH0.bypass).to.deep.equal({ frames: 8, selectionPasses: 0, prefixScans: 0, sourceDispatches: 8, passed: true });
        const lead = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('<!-- benefit-benchmark:start -->')[1].split('<!-- benefit-benchmark:end -->')[0];
        for (const r of summary.rows.filter(r => ['ours-direct', 'ours-auto'].includes(r.mode))) {
            expect(lead).to.include(`${r.movingMs.mean.toFixed(2)} / ${r.movingMs.median.toFixed(2)} / ${r.movingMs.p95.toFixed(2)} ms`);
        }
        expect(lead).to.include('not** the quality');
    });

    it('records real losing and marginal decisions, not just an injected policy example', function () {
        const controls = json('fallback-controls.json');
        expect(controls).to.have.length(2);
        for (const { proof } of controls) {
            expect(proof.passed).to.equal(true);
            expect(proof.info.performance.enabled).to.equal(true);
            expect(proof.info.performance.path).to.equal('direct');
            expect(proof.info.performance.probing).to.equal(false);
            expect(proof.bypass).to.deep.equal({ frames: 8, selectionPasses: 0, prefixScans: 0, sourceDispatches: 8, passed: true });
        }
        expect(controls[0].proof.info.performance.decision.gain).to.be.lessThan(0);
        expect(controls[1].proof.info.performance.decision.gain).to.be.lessThan(0.1);
        const paths = json('paths.json');
        expect(paths).to.have.length(8);
        for (const p of paths) {
            expect(p.moving.direct + p.moving.lod).to.equal(90);
            expect(p.qualityPaths).to.have.length(5);
        }
        // Image captures can fall back after jumps. Never relabel those as LOD quality.
        for (const p of paths.filter(p => ['bee', 'ekotori'].includes(p.scene))) {
            expect(p.qualityPaths).to.deep.equal(Array(5).fill('direct'));
        }
    });
});
