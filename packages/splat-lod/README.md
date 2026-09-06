# Standalone splat LOD

A standalone cube-LOD renderer, bundled with PlayCanvas main at [d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63) (2.23.0-beta.2). It doesn't need the original project, a CDN, or a PlayCanvas npm dependency at runtime.

This is **WebGPU-only, experimental, and lossy when LOD is enabled**. It renders Gaussians, not MPI tiles or impostors. The default **2×** setting selects lower detail sooner; it does not promise twice the frame rate.

Automatic mode now checks whether LOD actually helps. It falls back to a direct original-splat path when the measured gain is insufficient. Culling, SH and output resolution stay unchanged.

## Install the built library

The GitHub release contains an installable ESM package. It is not published to the npm registry:

```sh
npm install https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/download/splat-lod-v0.3.0/shinmegami-boson-splat-lod-0.3.0.tgz
```

```js
import { createSplatRenderer } from '@shinmegami-boson/splat-lod';

const canvas = document.querySelector('canvas');
const renderer = await createSplatRenderer({
    canvas,
    manifestUrl: '/scene/manifest.json',
    camera: { position: [2.6, 1.6, 3.2], target: [0, 0, 0] },
    lodMultiplier: 2,
    adaptiveLod: true,
    renderSettings: { profile: 'exact', shMode: 'visible' },
    onProgress: message => console.log(message),
    onError: error => console.error(error)
});

// Canvas CSS size is owned by your application. These dimensions are CSS pixels.
renderer.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
renderer.start();

// Or use your own animation loop: update the camera, then call render() once.
renderer.setCamera({ position: [3, 1.6, 3.2], target: [0, 0, 0] });
renderer.setLodMultiplier(4);
renderer.setAdaptiveLod(false);  // fixed screen-size LOD, for controlled comparisons
renderer.setAdaptiveLod(true);   // choose based on measured render cost (default)
renderer.setMode('source');       // original splats only
renderer.setMode('lower-only');   // only reduced chunks that actually qualify
renderer.setMode('automatic');
renderer.setChunkColors(true);   // diagnostic colors, same geometry and opacity

// Diagnostics are optional. Do not put capture/audit/flush in the normal frame loop.
renderer.stop();
const stats = await renderer.readStats();
const audit = await renderer.audit();
const image = await renderer.capture();
renderer.dispose();
```

Use HTTPS or localhost. `createSplatRenderer` resolves after loading, validation, GPU initialization, and the first selected frame. It rejects on failure; it does not silently fall back to WebGL or reduced SH. Rendering starts only when you call `start()` or `render()`.

See [index.d.ts](index.d.ts) for the complete API. `setCamera` preserves unspecified fields. `resize` uses physical pixels, with no internal resolution reduction. `readStats()` reads only 48 bytes and may return `null` if the camera changes during readback. `capture()` reads a full RGBA8 image; `audit()` expands selected IDs **for validation only**. Wait for these operations before changing or disposing the renderer. Connect your own resize observer, camera controls, and error UI.

## Prepare a scene

The package includes CPU preprocessing tools using only Python, NumPy, and SciPy. No Blender, Torch, cloud API, image generation, or model download is involved.

```sh
python3 -m venv .venv
.venv/bin/pip install -r node_modules/@shinmegami-boson/splat-lod/build/tools/requirements.txt
.venv/bin/python node_modules/@shinmegami-boson/splat-lod/build/tools/build_lod.py \
    your-scene.ply public/scene --cell-size 0.25
```

Choose the cube edge length in **your scene's world units**. The example uses `0.25`; the bee used `0.03`. There is no universal correct size. Small cubes refine spatially but create more selection work and singleton cubes; large cubes keep distant and nearby geometry tied to the same LOD choice.

Input: binary little-endian float32 Gaussian PLY with SH0 or SH3, or the SuperSplat compressed PLY layout with SH3. SH0 inputs stay SH0; no higher coefficients are invented. Optional float32 fields such as normals are ignored. Source positions must already be in world coordinates. Every center belongs to exactly one cube; Gaussian footprints are not clipped at cube boundaries. Use a new output directory.

Output:

- a byte-identical source copy;
- three native PLY banks, approximately half, quarter and eighth density;
- a source-ID permutation, per-cube ranges, grid coordinates, and conservative support bounds;
- a completed `manifest.json` with lengths and SHA-256 digests.

The loader validates ownership, metadata digests, replacement-bank digests, counts and SH degree. New manifests also verify the original source's digest. Legacy version-6 manifests lacking `sourceSha256` are supported but report `sourceHashVerified: false`.

## How it works

1. **Offline:** spatial KD grouping **inside each cube**, followed by optical-depth/surface-area weighted moment matching of position, covariance, opacity, DC and all 45 higher-order SH coefficients. Group spans are 2, 4 and 8; no cross-cube merge occurs.
2. **Per view, GPU:** project cube bounds and select one complete bank range for each visible cube. Near cubes keep all originals; distant cubes use a reduced bank. A 10% hysteresis band reduces boundary toggling.
3. **GPU prefix scan:** compact the selected **ranges**, not a per-frame CPU list of splat IDs. A permanent source-order map and current world-bank addresses resolve each Gaussian directly in the projector.
4. **Projection and SH:** dispatch the four banks into one projected cache and counter. By default, evaluate SH3 for visible splats, preserving PlayCanvas's color quantization. SH0 needs no directional color evaluation. An optional cached mode uses PC's work-buffer color updates instead.
5. **Global sort and draw:** retain PlayCanvas's GPU depth sort across all selected banks, then its quad expansion, Gaussian rasterization, and alpha blending. There is no per-chunk compositing order.

At multiplier 1, cube bounding-sphere diameters of **128 / 64 / 32 physical pixels** are eligible for half / quarter / eighth density. At multiplier 2 these become **256 / 128 / 64 pixels**, before hysteresis. Visibility uses larger Gaussian-support bounds; those bounds do not force higher LOD.

## Rendering settings

### When LOD runs

The default speed selector compares the direct and LOD paths using PlayCanvas's asynchronous GPU timestamps plus CPU render-submission time. Cost is the larger of those two overlapping spans, not their sum or claimed FPS.

It starts with originals and uses short alternating probe blocks: four warmup frames and twelve measured frames per path. LOD needs at least a 10% median cost advantage and no more than a 10% p95 penalty to activate. Once active, it falls back when its advantage drops below 3% or the tail guard fails. Those different entry/exit margins prevent small fluctuations from constantly switching detail.

Measurements are revisited after substantial camera movement, with a 120-frame minimum hold, or every 600 rendered frames. Resize and LOD-threshold changes invalidate the comparison. Missing or inconclusive GPU timestamps keep the original-splat path. Probe results from an obsolete comparison are ignored.

The direct path does **not** run cube classification, prefix scans, per-splat range searches or three empty LOD-bank dispatches. It projects the source bank once, then uses the same global sort and rasterizer. All banks remain resident; this change saves per-frame work, not memory.

This is measured adaptation, not an oracle that guarantees every future frame is faster. Brief probes can temporarily use the losing path, and movement or contention can make an older measurement stale. No second representation is drawn on top of the first, no completion fence is inserted in the normal render loop, and there is no hidden quality-setting change. Path changes use hysteresis, not a geometry crossfade.

Use `setAdaptiveLod(false)` for the fixed screen-size control. Explicit original/reduced-only modes and diagnostic chunk colors override the speed selector. `getInfo().performance` reports the actual path, decision and probing state; `getInfo().dispatch` exposes selection/prefix/dispatch counters. In direct mode, selection statistics count original records submitted to the projector; final visibility is decided there.

### Culling and SH

Pass `renderSettings` when creating the renderer:

| `profile` | Minimum pixel size | Minimum contribution |
| --- | ---: | ---: |
| `exact` | 0 | 0 |
| `contribution` | 0 | 3 |
| `playcanvas` | 2 | 3 |

These are the upstream projector's filters. `exact` disables extra culling; it does not make merged LOD splats lossless. To compare against unmerged originals, also call `setMode('source')`.

`shMode: 'visible'` evaluates current-view SH after culling. `shMode: 'cached'` uses PC's color cache, with `colorUpdateAngle: 10` by default. Caching can trade color accuracy for speed, and a full-bank refresh can cost more than evaluating just the visible splats. All available source coefficients remain in the assets. `getInfo().renderSettings` reports the active settings.

## Limits and quality

- All four banks remain resident. This reduces per-view work, **not memory use or initial download size**. There is no streaming or on-demand bank eviction.
- SH0 and SH3; no silent dropping of coefficients. SH1/SH2 inputs are rejected. The SOG v2 runtime path is retained; browser regression tests use native and compressed PLY.
- Static geometry, identity model transform, one mono perspective camera per renderer. No WebGL, XR/stereo, orthographic camera, picking, animated splats, or scene-graph embedding API is supplied.
- Merged covariance and SH are approximations. Weighted SH does **not** exactly encode internal occlusion, and the pixel-size thresholds are not a proven perceptual-error bound. View-dependent differences and LOD transitions can remain visible.
- LOD is a quality/performance tradeoff, not a universal speedup. The [v0.3 automatic/direct comparison](BENEFIT-BENCHMARKS.md) includes probe overhead and fallback checks. The [fixed-LOD/stock-defaults comparison](MAIN-BENCHMARKS.md) uses v0.2; the [older three-renderer comparison](BENCHMARKS.md) uses v0.1.
- The integration uses private projector APIs. The tested base is recorded in [engine-base.js](../../src/framework/splat-lod/engine-base.js); shader-source and layout checks fail if those internals change.

## Build and run the example from the fork

```sh
git clone https://github.com/ShinMegamiBoson/playcanvas-splat-lod.git
cd playcanvas-splat-lod
npm ci --ignore-scripts
npm --prefix packages/splat-lod run build

python3 -m venv .venv
.venv/bin/pip install -r scripts/splat-lod/requirements.txt
.venv/bin/python scripts/splat-lod/make_example.py packages/splat-lod/example-data/source.ply
.venv/bin/python scripts/splat-lod/build_lod.py \
    packages/splat-lod/example-data/source.ply packages/splat-lod/example-data/lod --cell-size 0.25
npm --prefix packages/splat-lod run demo
```

Open `http://localhost:8015`. The synthetic torus is original generated data, not a bundled scan. Drag to look, move with WASD, or use Move back. Advanced controls compare original/automatic/reduced-only modes, color cubes, and run actual GPU selection/image checks. Missing assets show a blocked state, not a ready state.

```sh
npm --prefix packages/splat-lod run lint
npm --prefix packages/splat-lod test
npm --prefix packages/splat-lod run test:types
.venv/bin/python test/splat-lod/preprocessing_test.py
(cd packages/splat-lod && npm pack)
```

The package build reuses upstream's release transforms and bundles the fork's source. It does not fetch a runtime from a CDN. Generated bundles, scans, bank files, and local proof captures are not committed.

MIT, retaining PlayCanvas's license. This is an independent fork, not an official PlayCanvas release. Third-party scene licenses remain separate.
