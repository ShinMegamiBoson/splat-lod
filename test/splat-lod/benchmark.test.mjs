import { expect } from 'chai';

import { MAIN_PROTOCOL, OPTIMIZATION_SETTINGS } from '../../packages/splat-lod/benchmark/main-protocol.mjs';
import { PROTOCOL, cameraAt, imageError, quantile } from '../../packages/splat-lod/benchmark/protocol.mjs';
import { SCENES } from '../../packages/splat-lod/benchmark/scenes.mjs';
import { ENGINE_BASE } from '../../src/framework/splat-lod/engine-base.js';

describe('multi-scene benchmark protocol', function () {
    it('keeps the main-base ablations separate from the published v2 protocol', function () {
        expect(MAIN_PROTOCOL.version).to.equal(3);
        expect(PROTOCOL.version).to.equal(2);
        expect(MAIN_PROTOCOL.engineRevision).to.equal(ENGINE_BASE.revision);
        expect(MAIN_PROTOCOL.modes).to.have.length(7);
        expect(MAIN_PROTOCOL.modes).to.include.members(['pc-full', 'pc-default', 'ours-source', 'ours-lod']);
        expect(OPTIMIZATION_SETTINGS['ours-contribution']).to.deep.equal({ profile: 'contribution', shMode: 'visible' });
        expect(OPTIMIZATION_SETTINGS['ours-defaults'].shMode).to.equal('visible');
        expect(OPTIMIZATION_SETTINGS['ours-cached'].colorUpdateAngle).to.equal(10);
    });
    it('uses three entire scenes with SH3 and a matched physical viewport', function () {
        expect(SCENES.map(s => s.count)).to.deep.equal([652804, 2315943, 7081853]);
        expect([PROTOCOL.width, PROTOCOL.height]).to.deep.equal([2560, 1440]);
        expect(PROTOCOL.modes).to.include.members(['pc-default', 'pc-full', 'ours-lod', 'ours-source', 'spark', 'luma']);
    });
    it('preserves camera up and returns finite translating/rotating paths', function () {
        for (const scene of SCENES) {
            const first = cameraAt(scene, 0), end = cameraAt(scene, 1);
            expect(first.position).to.deep.equal(scene.camera.position);
            expect(first.up).to.deep.equal(scene.camera.up);
            expect(end.position).not.to.deep.equal(first.position);
            for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(cameraAt(scene, t).position.every(Number.isFinite)).to.equal(true);
        }
    });
    it('computes pooled quantiles, not the median of medians', function () {
        expect(quantile([1, 2, 10, 20], 0.5)).to.equal(6);
        expect(quantile([1, 2, 10, 20], 0.95)).to.be.closeTo(18.5, 1e-10);
        expect(() => quantile([NaN], 0.5)).to.throw();
    });
    it('separates background dilution from foreground RGB error and ignores alpha', function () {
        const reference = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
        const candidate = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]);
        const error = imageError(reference, candidate, [0, 0, 0]);
        expect(error.foregroundPixels).to.equal(1);
        expect(error.psnrDb).to.be.closeTo(10 * Math.log10(2), 1e-10);
        expect(error.foregroundPsnrDb).to.equal(0);
        expect(imageError(reference, reference, [0, 0, 0]).exact).to.equal(true);
        expect(() => imageError(reference, new Uint8Array(4), [0, 0, 0])).to.throw();
    });
});
