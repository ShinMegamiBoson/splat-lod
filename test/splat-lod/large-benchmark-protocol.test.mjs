import assert from 'node:assert/strict';

import { LARGE_PROTOCOL } from '../../packages/splat-lod/benchmark/large-protocol.mjs';
import { rankRenderers } from '../../packages/splat-lod/benchmark/rank-renderers.mjs';

const row = (mode, median, passed = true) => ({ mode, passed, movingMs: { median } });

describe('Large-scene benchmark ranking', function () {
    it('keeps matched frames and excludes the fixed-LOD diagnostic from winners', function () {
        assert.equal(LARGE_PROTOCOL.width, 2560);
        assert.equal(LARGE_PROTOCOL.height, 1440);
        assert.equal(LARGE_PROTOCOL.samples, 90);
        assert.equal(LARGE_PROTOCOL.warmup, 64);
        assert.equal(LARGE_PROTOCOL.repeats, 2);
        assert.equal(LARGE_PROTOCOL.rankingMetric, 'moving-completed-frame-median-ms');
        assert(!LARGE_PROTOCOL.rankedModes.includes('ours-fixed'));
        assert(LARGE_PROTOCOL.modes.includes('ours-fixed'));
    });

    it('highlights the actual winner, including competitors, and divides runner-up by winner', function () {
        const rank = rankRenderers([row('ours', 12), row('pc', 8), row('spark', 10)], ['ours', 'pc', 'spark']);
        assert.deepEqual(rank.winners, ['pc']);
        assert.equal(rank.runnerUp.mode, 'spark');
        assert.equal(rank.speedup, 1.25);
        assert(rank.complete);
        assert(!rank.nearTie);
    });

    it('keeps exact ties, flags small margins and never rounds before ranking', function () {
        assert.deepEqual(rankRenderers([row('a', 8), row('b', 8)], ['a', 'b']).winners, ['a', 'b']);
        const rank = rankRenderers([row('a', 8.004), row('b', 8.003)], ['a', 'b']);
        assert.deepEqual(rank.winners, ['b']);
        assert(rank.nearTie);
        assert(rank.speedup > 1);
    });

    it('leaves failures, missing rows and non-finite times unranked', function () {
        const rank = rankRenderers([row('a', 0, false), row('b', 10), row('c', NaN)], ['a', 'b', 'c', 'd']);
        assert.deepEqual(rank.excluded, ['a', 'c', 'd']);
        assert.equal(rank.speedup, null);
        assert(!rank.complete);
        assert.throws(() => rankRenderers([row('a', 1), row('a', 2)], ['a', 'b']), /Duplicate/);
    });
});
