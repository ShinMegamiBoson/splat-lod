import { expect } from 'chai';

import { LodPerformancePolicy, LOD_PERFORMANCE_POLICY, createLodPerformanceMonitor } from '../../src/framework/splat-lod/performance-policy.js';
import { RANGE_LOOKUP_WGSL } from '../../src/framework/splat-lod/range-core.js';

const short = { ...LOD_PERFORMANCE_POLICY, warmup: 0, samples: 4, block: 1, holdFrames: 10, recheckFrames: 40, timeoutFrames: 20 };
function measure(policy, direct, lod) {
    let i = 0;
    do {
        const next = policy.next();
        if (next.sample) policy.observe(next.epoch, next.path, next.path === 'direct' ? direct[i % direct.length] : lod[i % lod.length], 0.1);
        i++;
    } while (policy.probing && i < 100);
}

describe('benefit-gated LOD', function () {
    it('starts conservatively and never guesses a timing win without timestamp support', function () {
        const p = new LodPerformancePolicy(false, short);
        for (let i = 0; i < 100; i++) expect(p.next()).to.deep.equal({ path: 'direct', sample: false });
        expect(p.reason).to.equal('timing-unavailable');
    });
    it('bypasses losing or marginal LOD and enters only after a measured margin', function () {
        for (const lod of [11, 10, 9.5]) {
            const p = new LodPerformancePolicy(true, short); measure(p, [10], [lod]);
            expect(p.path).to.equal('direct'); expect(p.probing).to.equal(false);
        }
        const p = new LodPerformancePolicy(true, short); measure(p, [10], [8]);
        expect(p.path).to.equal('lod');
        expect(p.lastDecision.gain).to.be.closeTo(0.2, 1e-12);
    });
    it('uses different enter/leave margins but does not retain an actual slowdown', function () {
        const p = new LodPerformancePolicy(true, short); measure(p, [10], [8]);
        p.nextProbe = p.frame; measure(p, [10], [9.5]);
        expect(p.path).to.equal('lod');
        p.nextProbe = p.frame; measure(p, [10], [10.1]);
        expect(p.path).to.equal('direct');
    });
    it('rejects a median win with worse tails', function () {
        const p = new LodPerformancePolicy(true, { ...short, block: 4 }); measure(p, [10], [4, 4, 4, 20]);
        expect(p.path).to.equal('direct');
    });
    it('accounts for CPU submission cost, not just GPU work', function () {
        const p = new LodPerformancePolicy(true, short);
        for (let i = 0; i < 8; i++) {
            const n = p.next(); p.observe(n.epoch, n.path, 4, n.path === 'lod' ? 12 : 5);
        }
        expect(p.path).to.equal('direct');
    });
    it('ignores invalid and obsolete samples and backs off after a timing timeout', function () {
        const p = new LodPerformancePolicy(true, short), stale = p.next();
        p.requestRecheck(true); p.next();
        p.observe(stale.epoch, 'lod', 0.001, 0);
        for (const value of [NaN, Infinity, -1, 0]) p.observe(p.epoch, 'direct', value, 0);
        expect(p.samples.lod).to.have.length(0); expect(p.samples.direct).to.have.length(0);
        for (let i = 0; i < 22; i++) p.next();
        expect(p.path).to.equal('direct'); expect(p.reason).to.equal('timing-inconclusive');
        expect(p.next().sample).to.equal(false);
    });
    it('holds a settled decision before motion-triggered reevaluation', function () {
        const p = new LodPerformancePolicy(true, short); measure(p, [10], [8]);
        p.requestRecheck();
        for (let i = 0; i < 9; i++) expect(p.next().sample).to.equal(false);
        expect(p.next().sample).to.equal(true);
    });
    it('resolves direct source addresses before entering the per-splat range search', function () {
        const shortcut = RANGE_LOOKUP_WGSL.indexOf('return rangeUniforms.info.z+index');
        expect(shortcut).to.be.greaterThan(0);
        expect(shortcut).to.be.lessThan(RANGE_LOOKUP_WGSL.indexOf('let wanted='));
    });
    it('honors diagnostic overrides and restores the owned profiler on disposal', function () {
        const report = () => {};
        const device = { supportsTimestampQuery: true,
            renderVersion: 1,
            gpuProfiler: { timestampQueriesSet: {}, report, enabled: false } };
        const lod = { mode: 'automatic', rangeDebugColors: false };
        const monitor = createLodPerformanceMonitor(device, lod, 1);
        const view = { position: [0, 0, 1], target: [0, 0, 0] };
        monitor.before(view); expect(lod.directSource).to.equal(true);
        monitor.setEnabled(false); monitor.before(view); expect(lod.directSource).to.equal(false);
        lod.mode = 'source'; monitor.before(view); expect(lod.directSource).to.equal(true);
        lod.rangeDebugColors = true; monitor.before(view); expect(lod.directSource).to.equal(false);
        monitor.destroy();
        expect(device.gpuProfiler.report).to.equal(report);
        expect(device.gpuProfiler.enabled).to.equal(false);
    });
});
