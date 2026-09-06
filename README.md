# PlayCanvas Splat LOD

Standalone **WebGPU Gaussian splat rendering with cube-based LOD**, forked from PlayCanvas under ShinMegamiBoson.

The library extracts the renderer tested in the bee comparison: original / half / quarter / eighth-density cube banks, GPU screen-size selection, world-indexed range projection, visible-only SH3, and PlayCanvas's global GPU depth sort. The default **2×** setting makes LOD activate sooner; it is not a promise of 2× FPS.

- [Install, API, preprocessing and example](packages/splat-lod/README.md)
- [Description of changes from PlayCanvas](packages/splat-lod/CHANGES.md)
- [Measured performance and quality tradeoffs](packages/splat-lod/BENCHMARKS.md)
- [Download the installable package](https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/tag/splat-lod-v0.1.0)

```sh
npm install https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/download/splat-lod-v0.1.0/shinmegami-boson-splat-lod-0.1.0.tgz
```

```js
import { createSplatRenderer } from '@shinmegami-boson/splat-lod';

const renderer = await createSplatRenderer({
    canvas: document.querySelector('canvas'),
    manifestUrl: '/scene/manifest.json',
    camera: { position: [2.6, 1.6, 3.2], target: [0, 0, 0] },
    lodMultiplier: 2
});
renderer.start();
```

Prepare the manifest and Gaussian banks with the included Python tools. The package is self-contained at runtime; it does not import Endless Almanac or fetch an engine from a CDN.

## What is actually proven?

The standalone preprocessor reproduced the bee's three LOD banks and eight metadata files **byte-for-byte**. Real-browser GPU selection audits passed for the synthetic scene and bee, and six full-resolution bee render comparisons closely matched the original implementation. Details and proof boundaries are in [CHANGES.md](packages/splat-lod/CHANGES.md).

The earlier benchmark measured **6.50 ms moving completed-frame latency with LOD** versus **9.30 ms for stock PlayCanvas 2.22.0**, at 2560×1440 on one Apple M5 Max. That is a scene-specific **1.43×** result with loss: minimum foreground PSNR was **28.73 dB**. The four-bank path with LOD disabled was slower than stock. These are not lossless-quality, universal-speedup or interactive-FPS claims.

## Scope

Experimental; WebGPU only, static world-space geometry, perspective camera, SH3. All four banks are resident; this is **not a streaming or memory-reduction solution**. No bee, store, city scan, or derived private asset is included. The example creates its own synthetic geometry.

Pinned to upstream [PlayCanvas 2.21.4](https://github.com/playcanvas/engine/tree/v2.21.4), commit `e287e0c67f3c20c689a52b7c53d2b7fedbe887da`, because that is the tested private projector API. The full upstream engine remains in this fork; its original documentation is in [README.upstream.md](README.upstream.md).

[MIT license](LICENSE), retaining PlayCanvas's copyright. This is an independent fork, not an official PlayCanvas package. Third-party scan licenses are separate.
