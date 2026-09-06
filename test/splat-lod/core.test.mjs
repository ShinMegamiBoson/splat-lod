import assert from 'node:assert/strict';

import { stub } from 'sinon';

import defaults from '../../src/framework/splat-lod/cube-policy-defaults.json' with { type: 'json' };
import { validateCubePartition } from '../../src/framework/splat-lod/cube-policy.js';
import { validateManifest, checkedBytes } from '../../src/framework/splat-lod/manifest.js';
import { lodScale, validateCamera, validateViewport } from '../../src/framework/splat-lod/options.js';
import { validateScenePartition, projectedChunk } from '../../src/framework/splat-lod/projection.js';
import { rangePrefixes, resolveRangeId } from '../../src/framework/splat-lod/range-core.js';
import { selectSceneRegions, materializeRegionSelection, writeRegionColorIds } from '../../src/framework/splat-lod/regions.js';

function fixture() {
    const counts = [9, 1, 16], radius = Math.sqrt(3) / 2;
    const offsets = defaults.levels.map(level => new Uint32Array([0, ...counts.map((_, i) => counts.slice(0, i + 1).reduce((sum, n) => sum + (level.id ? (n > 1 ? Math.ceil(n / level.span) : 0) : n), 0))]));
    const bounds = new Float32Array(counts.flatMap((_, i) => [i + 0.5, 0.5, 0.5, radius]));
    const cubes = { policy: { ...structuredClone(defaults), cellSize: 1 }, offsets, coordinates: new Int32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]), bounds, drawBounds: bounds.slice() };
    const order = new Uint32Array([8, 7, 6, 5, 4, 3, 2, 1, 0, ...Array.from({ length: 17 }, (_, i) => i + 9)]);
    return { cubes, order };
}
const pose = z => ({ position: [0.5, 0.5, z], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], focal: 1000, width: 1000, height: 1000, near: 0.01 });

describe('standalone cube LOD core', function () {
    it('covers every source exactly once, including singleton cubes', function () {
        const { cubes, order } = fixture();
        assert.equal(validateCubePartition(order, cubes, 26).chunkCount, 3);
        assert.equal(cubes.offsets[1][2], cubes.offsets[1][1]);
        assert.throws(() => validateScenePartition(new Uint32Array([0, 0]), 2), /Duplicate/);
        assert.throws(() => validateScenePartition(new Uint32Array([0, 2]), 2), /range/);
    });
    it('rejects mismatched counts, empty cubes, nonfinite bounds and cross-cube ranges', function () {
        const corrupt = (change) => {
            const { cubes, order } = fixture(); change(cubes); assert.throws(() => validateCubePartition(order, cubes, 26));
        };
        corrupt((c) => {
            c.bounds[0] = NaN;
        });
        corrupt((c) => {
            c.drawBounds[3] = 0;
        });
        corrupt((c) => {
            c.offsets[0][1] = 0;
        });
        corrupt((c) => {
            c.offsets[1][1]++;
        });
        corrupt((c) => {
            c.coordinates[3] = 0;
        });
    });
    it('uses originals near the camera and reduced whole cubes far away', function () {
        const { cubes } = fixture();
        const near = selectSceneRegions(cubes, pose(4));
        const far = selectSceneRegions(cubes, pose(100));
        assert.deepEqual([...near.tags], [1, 1, 1]);
        assert.deepEqual([...far.tags], [4, 1, 4]);
        assert.equal(near.activeCount, 26);
        assert.equal(far.activeCount, 5);
        assert.equal(far.stats.coveredSourceSplats, 26);
    });
    it('lower-only hides originals without forcing unqualified reductions', function () {
        const { cubes } = fixture();
        assert.equal(selectSceneRegions(cubes, pose(4), 'lower-only').activeCount, 0);
        const far = selectSceneRegions(cubes, pose(100), 'lower-only');
        assert.deepEqual([...far.tags], [4, 0, 4]);
        assert.equal(far.stats.splatsByLevel[0], 0);
        assert.equal(selectSceneRegions(cubes, pose(100), 'source').activeCount, 26);
    });
    it('uses hysteresis without changing the threshold definition', function () {
        const { cubes } = fixture();
        assert.equal(selectSceneRegions(cubes, pose(8)).tags[0], 1);
        assert.equal(selectSceneRegions(cubes, pose(8), 'automatic', { previousTags: new Uint32Array([2, 1, 1]) }).tags[0], 2);
    });
    it('does not cull support intersecting the near plane or viewport', function () {
        assert.deepEqual(projectedChunk(new Float32Array([0.5, 0.5, 4, 1]), pose(4)), { visible: true, pixels: Infinity });
        assert.equal(projectedChunk(new Float32Array([0.5, 0.5, 6, 0.1]), pose(4)).visible, false);
        const { cubes } = fixture();
        cubes.bounds[0] = 20; cubes.drawBounds[0] = 20; cubes.drawBounds[3] = 25;
        assert.equal(selectSceneRegions(cubes, pose(4), 'source').tags[0], 1);
    });
    it('resolves bank-major prefixes to permanent IDs across holes and relocated bank bases', function () {
        const { cubes, order } = fixture();
        const tags = new Uint32Array([2, 0, 4]);
        const prefix = rangePrefixes(tags, cubes.offsets), bases = [800, 1500, 3200, 7000];
        const ids = [];
        for (let bank = 0; bank < 4; bank++) {
            for (let i = 0; i < prefix[(bank + 1) * 4 - 1] - prefix[bank * 4]; i++) ids.push(resolveRangeId(prefix, cubes.offsets, order, bases, bank, i));
        }
        assert.deepEqual(ids, [1500, 1501, 1502, 1503, 1504, 7002, 7003]);
        assert.throws(() => resolveRangeId(prefix, cubes.offsets, order, bases, 0, 0), /Invalid/);
        const source = selectSceneRegions(cubes, pose(4), 'source');
        assert.deepEqual([...materializeRegionSelection(source, cubes, order, bases)], [...order].map(i => i + 800));
    });
    it('chunk colors follow ownership, not ID order, and have no selection side effect', function () {
        const { cubes, order } = fixture(), target = new Uint32Array(26);
        writeRegionColorIds(target, cubes.offsets[0], order);
        assert.equal(target[0], 0); assert.equal(target[9], 1); assert.equal(target[25], 2);
        assert.equal(lodScale(2), 1); assert.equal(lodScale(1), 0.5);
    });
    it('validates camera bases, falloff, and native-resolution dimensions', function () {
        assert.throws(() => lodScale(Infinity)); assert.throws(() => lodScale(0));
        assert.deepEqual(validateViewport(1280, 720, 2, 8192), [2560, 1440]);
        assert.throws(() => validateViewport(1280, 720, 8, 8192));
        assert.throws(() => validateViewport(0, 720, 1, 8192));
        const camera = { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1, 0], fovDegrees: 40, near: 0.01, far: 100 };
        assert.equal(validateCamera(camera), camera);
        assert.throws(() => validateCamera({ ...camera, up: [0, 0, 1] }));
        assert.throws(() => validateCamera({ ...camera, far: 0.001 }));
    });
});

describe('asset contract', function () {
    function manifest() {
        const info = { bytes: 4, sha256: 'a'.repeat(64) };
        const m = { complete: true, version: 6, policy: structuredClone(defaults), sourceCount: 26, chunkCount: 3, source: 'source.ply', sourceOrder: 'source-order.u32', levels: [], files: {} };
        m.levels = [1, 2, 3].map(id => ({ id, span: 2 ** id, splats: 3, file: `level-${id}.ply`, offsets: `level-${id}.offsets.u32`, ...info }));
        for (const name of [m.sourceOrder, 'source-offsets.u32', 'coordinates.i32', 'cube.bounds.f32', 'cube.draw-bounds.f32', ...m.levels.map(l => l.offsets)]) m.files[name] = { ...info };
        return m;
    }
    it('accepts the precise supported bank contract and rejects partial/changed schemas', function () {
        assert.equal(validateManifest(manifest()).sourceCount, 26);
        const corrupt = (change) => {
            const m = manifest(); change(m); assert.throws(() => validateManifest(m));
        };
        corrupt((m) => {
            m.complete = false;
        });
        corrupt((m) => {
            m.policy.levels[1].span = 8;
        });
        corrupt((m) => {
            m.sourceCount = NaN;
        });
        corrupt((m) => {
            m.levels[0].sha256 = 'wrong';
        });
        corrupt((m) => {
            m.levels[2].splats = 0;
        });
        corrupt((m) => {
            delete m.files['coordinates.i32'];
        });
    });
    it('rejects corrupt payloads and HTTP failures instead of showing a ready state', async function () {
        const fetchStub = stub(globalThis, 'fetch');
        try {
            fetchStub.callsFake(() => Promise.resolve(new Response('abc')));
            assert.equal((await checkedBytes('http://example.test/test', { bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' })).byteLength, 3);
            await assert.rejects(checkedBytes('http://example.test/test', { bytes: 4 }), /length/);
            await assert.rejects(checkedBytes('http://example.test/test', { sha256: '0'.repeat(64) }), /SHA/);
            fetchStub.callsFake(() => Promise.resolve(new Response('missing', { status: 404 })));
            await assert.rejects(checkedBytes('http://example.test/test'), /404/);
        } finally {
            fetchStub.restore();
        }
    });
});
