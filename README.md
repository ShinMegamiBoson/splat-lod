# PlayCanvas Splat LOD

Full-resolution splats up close, fewer splats farther away. A standalone WebGPU renderer forked from PlayCanvas, with per-cube LOD and SH0/SH3.

<!-- main-benchmark:start -->
## Benchmarks on current PlayCanvas main

Same engine base on both sides: [d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63), 2.23.0-beta.2. Apple M5 Max, 128 GiB, 2560×1440. Four inputs, seven configurations, two reversed-order trials: **10,080 timed frames**.

Our default LOD is faster than stock defaults on the shop and both city inputs, but slower on the bee. Quality varies by scene too; this is not a lossless speedup.

| Scene / input splats | Our LOD median / p95 | PC defaults median / p95 | Speedup | Min foreground PSNR, ours / PC |
| --- | ---: | ---: | ---: | ---: |
| Bumblebee · 2.32M | 6.89 / 8.58 ms | 5.31 / 7.18 ms | 0.77× | 28.58 / 18.04 dB |
| Ekotori shop · 7.08M | 8.04 / 8.61 ms | 9.81 / 11.78 ms | 1.22× | 31.55 / 41.98 dB |
| Lublin city · published LOD 4 · 16.18M | 18.41 / 20.67 ms | 28.04 / 30.57 ms | 1.52× | 36.80 / 39.85 dB |
| Lublin city · published LOD 3 · 32.37M | 30.67 / 34.33 ms | 37.16 / 41.26 ms | 1.21× | 37.60 / 32.69 dB |

Moving-camera completed-frame latency, including sorting and a GPU completion fence—not interactive FPS. Speedup is PC defaults divided by ours; below 1× is slower. PSNR uses PC full quality as the reference. Higher is better.

The city rows are two published LOD levels of the **same** Lublin scan, not two independent scenes or the full 259M-splat original. They contain 16,184,440 and 32,368,879 SH0 splats. Bee and shop retain SH3. Every input splat is loaded before our LOD selection.

I also tried PC’s contribution culling, small-splat culling and cached SH. They are available as explicit options. The extra culling loses too much detail on the bee and 32M city input to make it the default; cached SH did not give a consistent win. [Settings and all seven results](packages/splat-lod/MAIN-BENCHMARKS.md).

[Reproduce it](packages/splat-lod/benchmark/MAIN.md) · [Per-frame data and checks](packages/splat-lod/benchmark/measurements/2026-09-06/summary.json)

Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com).
<!-- main-benchmark:end -->

<details>
<summary>Previous release: v0.1 comparisons with PlayCanvas, Spark and luma.gl</summary>

<!-- multi-scene-benchmark:start -->
## Multi-scene benchmarks

Three full SH3 scenes at 2560×1440, on an Apple M5 Max with 128 GB RAM. Two runs per configuration, in reversed order; 6,480 timed frames total.

These are median frame times while moving the camera. They include sorting and waiting for the GPU to finish, so don't read them as interactive FPS.

It doesn't consistently beat stock PlayCanvas yet. The bee and cicada are slower than the defaults. The shop is 1.07× faster at the median, but loses quality and has bad frame-time spikes: p95 is 43.51 ms versus 12.93 ms. The bigger speedups are against full quality, not the defaults.

| Scene / original splats | Ours, LOD 2× | PC defaults | PC full quality | Spark¹ | luma.gl² |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cicada Shell · 0.65M | 5.21 ms | 4.84 ms | 5.29 ms | 19.77 ms | 6.32 ms |
| Bumblebee · 2.32M | 5.39 ms | 4.93 ms | 8.61 ms | 29.00 ms | 10.39 ms |
| Ekotori shop · 7.08M | 10.10 ms | 10.85 ms | 16.83 ms | 88.80 ms | 24.04 ms |

PC defaults uses stock settings. PC full quality disables size and contribution cutoffs and updates SH every view. LOD is lossy, so here's the error against full quality (higher PSNR is better):

| Scene | Speed vs PC defaults / full quality | Our minimum foreground PSNR | PC-default foreground PSNR |
| --- | ---: | ---: | ---: |
| Cicada Shell | 0.93× / 1.01× | 27.08 dB | 33.07 dB |
| Bumblebee | 0.91× / 1.60× | 28.58 dB | 18.04 dB |
| Ekotori shop | 1.07× / 1.67× | 31.55 dB | 41.98 dB |

Below 1× means slower. The LOD setting of 2× makes reduced splats kick in sooner; it doesn't mean twice the FPS.

¹ This test waits for Spark's current-camera sort. Its normal async loop is timed separately. ² luma.gl's renderer is experimental. All use SH3, but packing, filtering and sorting differ.

[Full results and interactive timings](packages/splat-lod/BENCHMARKS.md) · [Run the benchmark](packages/splat-lod/benchmark/README.md) · [Raw data](packages/splat-lod/benchmark/measurements/2026-09-05/summary.json)
<!-- multi-scene-benchmark:end -->

</details>

## How it works

1. Split the scene into cubes.
2. Merge splats within each cube to make half-, quarter- and eighth-count versions. Keep the originals too.
3. On the GPU, pick a version for each cube based on its size on screen.
4. Project the selected splats, evaluate their SH for the visible ones, then depth-sort and render them together.

Splat IDs stay tied to the scene. Changing the view selects ranges of IDs instead of rebuilding the whole list on the CPU. The final output is still splats—no impostors or cached images.

[Changes from stock PlayCanvas](packages/splat-lod/CHANGES.md)

## Use it

```sh
npm install https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/download/splat-lod-v0.2.0/shinmegami-boson-splat-lod-0.2.0.tgz
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

Use the included Python tools to build the LOD files and manifest first. The engine is bundled; there are no runtime imports from a CDN or the original project.

[Setup, preprocessing and API](packages/splat-lod/README.md) · [Download](https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/tag/splat-lod-v0.2.0)

## Limits

Still experimental. WebGPU only, static scenes, perspective cameras, SH0 or SH3. All four LOD versions stay resident, so this uses more memory than the original splats. No streaming.

Rebased onto [PlayCanvas main, d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63) (2.23.0-beta.2). It uses private projection APIs, so engine upgrades need testing. The upstream engine is still in this repo; its docs are in [README.upstream.md](README.upstream.md).

[MIT](LICENSE), with PlayCanvas's copyright retained. Not an official PlayCanvas package. The test scans have their own licenses and aren't included; the demo uses a generated scene.
