# PlayCanvas Splat LOD

Full-resolution splats up close, fewer splats farther away. A standalone WebGPU renderer forked from PlayCanvas, with per-cube LOD and SH3.

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

## How it works

1. Split the scene into cubes.
2. Merge splats within each cube to make half-, quarter- and eighth-count versions. Keep the originals too.
3. On the GPU, pick a version for each cube based on its size on screen.
4. Project the selected splats, evaluate SH3 for the visible ones, then depth-sort and render them together.

Splat IDs stay tied to the scene. Changing the view selects ranges of IDs instead of rebuilding the whole list on the CPU. The final output is still splats—no impostors or cached images.

[Changes from stock PlayCanvas](packages/splat-lod/CHANGES.md)

## Use it

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

Use the included Python tools to build the LOD files and manifest first. The engine is bundled; there are no runtime imports from a CDN or the original project.

[Setup, preprocessing and API](packages/splat-lod/README.md) · [Download](https://github.com/ShinMegamiBoson/playcanvas-splat-lod/releases/tag/splat-lod-v0.1.0)

## Limits

Still experimental. WebGPU only, static scenes, perspective cameras, SH3. All four LOD versions stay resident, so this uses more memory than the original splats. No streaming.

Built against [PlayCanvas 2.21.4](https://github.com/playcanvas/engine/tree/v2.21.4). It uses private projection APIs, so engine upgrades need testing. The upstream engine is still in this repo; its docs are in [README.upstream.md](README.upstream.md).

[MIT](LICENSE), with PlayCanvas's copyright retained. Not an official PlayCanvas package. The test scans have their own licenses and aren't included; the demo uses a generated scene.
