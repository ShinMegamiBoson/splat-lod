# PlayCanvas Splat LOD

Standalone **WebGPU Gaussian splat rendering with cube-based LOD**, forked from PlayCanvas under ShinMegamiBoson.

<!-- multi-scene-benchmark:start -->
## Multi-scene benchmarks

Three complete SH3 scans, **2560×1440**, Apple M5 Max / 128 GB. Two reversed-order trials per configuration: **6,480 timed frames** plus interactive passes. Lower moving **completed-frame latency** is better; these milliseconds are **not measured interactive FPS**.

**No clean win over PlayCanvas defaults yet.** Ours is slower on the two object scenes. On the shop, its median is only 1.07× faster, with worse image quality and a much worse moving p95: **43.51 ms versus 12.93 ms**. The larger gains below are against the full-quality baseline, not default settings.

| Scene / original splats | Ours, LOD 2× | PC defaults | PC full quality | Spark¹ | luma.gl² |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cicada Shell · 0.65M | 5.21 ms | 4.84 ms | 5.29 ms | 19.77 ms | 6.32 ms |
| Bumblebee · 2.32M | 5.39 ms | 4.93 ms | 8.61 ms | 29.00 ms | 10.39 ms |
| Ekotori shop · 7.08M | 10.10 ms | 10.85 ms | 16.83 ms | 88.80 ms | 24.04 ms |

LOD changes the image. Against the full-quality PlayCanvas reference (higher PSNR is better):

| Scene | Speed vs PC defaults / full quality | Our minimum foreground PSNR | PC-default foreground PSNR |
| --- | ---: | ---: | ---: |
| Cicada Shell | 0.93× / 1.01× | 27.08 dB | 33.07 dB |
| Bumblebee | 0.91× / 1.60× | 28.58 dB | 18.04 dB |
| Ekotori shop | 1.07× / 1.67× | 31.55 dB | 41.98 dB |

A speed ratio below 1 means ours was slower. **This is a quality/performance tradeoff, not a universal or lossless speedup.** “2×” is the LOD activation setting, not a promised FPS multiplier.

¹ Spark waits for the current camera's worker sort here; its normal asynchronous interactive loop is measured separately. ² luma.gl uses a different, experimental renderer. All retain SH3; their packing, filtering and sorting are not pixel-identical.

[Full results, LOD-off control, interactive measurements and limitations](packages/splat-lod/BENCHMARKS.md) · [Reproduce it](packages/splat-lod/benchmark/README.md) · [Raw measurements](packages/splat-lod/benchmark/measurements/2026-09-05/summary.json)
<!-- multi-scene-benchmark:end -->

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

The multi-scene results above benchmark the standalone bundle itself. The [full report](packages/splat-lod/BENCHMARKS.md) separates stock defaults from full-quality settings, reports image error and interactive frame delivery, and includes the LOD-disabled control. These are not lossless-quality, universal-speedup or uncapped-FPS claims.

## Scope

Experimental; WebGPU only, static world-space geometry, perspective camera, SH3. All four banks are resident; this is **not a streaming or memory-reduction solution**. No bee, store, city scan, or derived private asset is included. The example creates its own synthetic geometry.

Pinned to upstream [PlayCanvas 2.21.4](https://github.com/playcanvas/engine/tree/v2.21.4), commit `e287e0c67f3c20c689a52b7c53d2b7fedbe887da`, because that is the tested private projector API. The full upstream engine remains in this fork; its original documentation is in [README.upstream.md](README.upstream.md).

[MIT license](LICENSE), retaining PlayCanvas's copyright. This is an independent fork, not an official PlayCanvas package. Third-party scan licenses are separate.
