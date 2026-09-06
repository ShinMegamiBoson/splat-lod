# Standalone splat LOD

A small browser-facing API around the benchmarked cube-LOD Gaussian renderer, bundled with this fork's PlayCanvas **2.21.4** engine. No Endless Almanac codebase, application, scene service, credentials, or PlayCanvas npm peer is required at runtime.

This is **WebGPU-only, experimental, and lossy when LOD is enabled**. It renders Gaussians, not MPI tiles or impostors. The default **2×** setting selects lower detail sooner; it does not promise twice the frame rate.

## Install the built library

The GitHub release contains an installable ESM package. It is not published to the npm registry:

```sh
npm install https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/download/splat-lod-v0.1.0/shinmegami-boson-splat-lod-0.1.0.tgz
```

```js
import { createSplatRenderer } from '@shinmegami-boson/splat-lod';

const canvas = document.querySelector('canvas');
const renderer = await createSplatRenderer({
    canvas,
    manifestUrl: '/scene/manifest.json',
    camera: { position: [2.6, 1.6, 3.2], target: [0, 0, 0] },
    lodMultiplier: 2,
    onProgress: message => console.log(message),
    onError: error => console.error(error)
});

// Canvas CSS size is owned by your application. These dimensions are CSS pixels.
renderer.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
renderer.start();

// Or use your own animation loop: update the camera, then call render() once.
renderer.setCamera({ position: [3, 1.6, 3.2], target: [0, 0, 0] });
renderer.setLodMultiplier(4);
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

Input: binary little-endian float32 Gaussian PLY with degree-3 SH, or the SuperSplat compressed PLY layout with SH3. Optional float32 fields such as normals are ignored. Source positions must already be in the desired world coordinate system. Every source center belongs to exactly one fixed cube; Gaussian footprints are **not clipped** at cube boundaries. A nonempty output directory is refused rather than overwritten.

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
4. **Projection and SH:** dispatch the four banks into one projected cache and counter. Evaluate SH3 for visible splats, preserving PlayCanvas's color quantization. There is no full-bank color refresh each moving frame.
5. **Global sort and draw:** retain PlayCanvas's GPU depth sort across all selected banks, then its quad expansion, Gaussian rasterization, and alpha blending. There is no per-chunk compositing order.

At multiplier 1, cube bounding-sphere diameters of **128 / 64 / 32 physical pixels** are eligible for half / quarter / eighth density. At multiplier 2 these become **256 / 128 / 64 pixels**, before hysteresis. Visibility uses larger Gaussian-support bounds; those bounds do not force higher LOD.

## Limits and quality

- All four banks remain resident. This reduces per-view work, **not memory use or initial download size**. There is no streaming or on-demand bank eviction.
- SH3 only; no silent dropping of coefficients. The SOG v2 runtime path is retained, but this extraction's browser regression tests cover native and compressed PLY, not a new SOG scene.
- Static geometry, identity model transform, one mono perspective camera per renderer. No WebGL, XR/stereo, orthographic camera, picking, animated splats, or scene-graph embedding API is supplied.
- Merged covariance and SH are approximations. Weighted SH does **not** exactly encode internal occlusion, and the pixel-size thresholds are not a proven perceptual-error bound. View-dependent differences and LOD transitions can remain visible.
- LOD is a quality/performance tradeoff, not a universal speedup. Compare the LOD-disabled control and stock-default/full-quality settings in the [three-scene benchmark](BENCHMARKS.md).
- The integration deliberately pins private projector APIs to PlayCanvas 2.21.4. Shader-source substitutions and layout checks fail closed if those internals change. Rebase and requalify before upgrading the engine.

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
