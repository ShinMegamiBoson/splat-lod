# Splat LOD

Full-resolution splats up close, fewer splats farther away. A standalone WebGPU renderer with per-cube LOD and SH0/SH3.

<!-- large-benchmark:start -->
## Large-scene benchmarks

September 6, 2026 · Splat LOD v0.3 · Apple M5 Max, 128 GB · **2560×1440**. Three new, distinct scenes; full published resolution, including LCC2Rock's environment. Rocca has SH3; the other two are natively SH0.

**Moving-camera median frame time; lower is better.** Bold is the fastest measured configuration. “Over next-best” is its speedup over second place—not necessarily our speedup. PC = PlayCanvas. Margins within 5% are near-ties, not established wins.

| Scene / input splats | Fastest | Over next-best | Splat LOD v0.3 | PC defaults | PC full quality | Spark 2.1 | luma.gl 9.4 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rocca di Montecatini Alto · 7.05M | PC defaults | 1.70× | 9.89 ms | **5.83 ms** | 10.13 ms | 100.70 ms | 22.34 ms |
| Wat Paknam Bhasicaroen · 8.85M | PC full quality | 1.02× (near-tie) | 18.28 ms | 14.32 ms | **14.02 ms** | 120.68 ms | 27.18 ms |
| LCC2Rock · 12.25M | Splat LOD v0.3 | 1.22× | **9.10 ms** | 11.09 ms | 12.35 ms | 148.81 ms | 27.61 ms |

Automatic mode used **original splats for all 540 measured moving frames**. These timings measure its optimized direct fallback, not an LOD speedup.

PlayCanvas is 2.23.0-beta.2 on the same engine base as this library. Two reversed-order trials; 36/36 cases completed. Timings include current-view sorting and a GPU completion fence, so they are **not interactive FPS**. Spark waits for its worker sort here; its normal asynchronous loop is reported separately. luma.gl is experimental. Different default approximations mean this is not a quality-matched race.

### Quality

Worst foreground RGB PSNR across five poses and both trials versus full-quality PlayCanvas; higher is better. ∞ means zero measured error, not a general equivalence guarantee. These are separate image captures, not measurements of every timed frame.

| Scene | Splat LOD v0.3 | PC defaults | PC full quality | Spark 2.1 | luma.gl 9.4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rocca di Montecatini Alto | 60.94 dB | 21.64 dB | ∞ | 27.14 dB | 23.06 dB |
| Wat Paknam Bhasicaroen | 62.16 dB | 30.90 dB | ∞ | 32.78 dB | 23.74 dB |
| LCC2Rock | 30.18 dB | 29.94 dB | ∞ | 31.24 dB | 25.97 dB |

**Quality captures can use a different path from the timing frames.** Rocca di Montecatini Alto: 10 original / 0 LOD; Wat Paknam Bhasicaroen: 10 original / 0 LOD; LCC2Rock: 6 original / 4 LOD. The fixed-LOD control below keeps reduction enabled for both timing and captures:

| Scene | Fixed LOD moving median / p95 | Fixed LOD minimum foreground PSNR |
| --- | ---: | ---: |
| Rocca di Montecatini Alto | 11.73 / 12.83 ms | 27.84 dB |
| Wat Paknam Bhasicaroen | 17.73 / 22.79 ms | 39.30 dB |
| LCC2Rock | 9.33 / 14.74 ms | 29.89 dB |

LOD trades quality for speed. The 2× setting changes transition distances, not FPS. These short paths on one device do not establish a universal fastest renderer or all-angle quality.

[All frame times, actual LOD paths and source credits](packages/splat-lod/benchmark/measurements/2026-09-06-large/README.md) · [Reproduce](packages/splat-lod/benchmark/LARGE.md) · [Numeric results](packages/splat-lod/benchmark/measurements/2026-09-06-large/summary.json)
<!-- large-benchmark:end -->

<details>
<summary>Earlier scenes and renderer versions</summary>

<!-- benefit-rerun:start -->
## 1.45–2.17× faster than PlayCanvas full quality in our moving-camera tests

Apple M5 Max, 2560×1440, inputs from 2.32M to 32.37M splats. Automatic LOD measures whether reducing splats saves time and falls back to originals when it doesn't. **LOD trades image quality for speed.**

| Input | PlayCanvas full quality | Our automatic LOD | Speedup |
| --- | ---: | ---: | ---: |
| Bumblebee · 2.32M | 8.46 ms | 5.83 ms | 1.45× |
| Ekotori shop · 7.08M | 21.15 ms | 9.74 ms | 2.17× |
| Lublin · published LOD 4 · 16.18M | 50.40 ms | 27.42 ms | 1.84× |
| Lublin · published LOD 3 · 32.37M | 81.98 ms | 47.04 ms | 1.74× |

Mean completed-frame times from the September 6 v0.3 rerun, including sorting, probe frames and a GPU completion fence—not interactive FPS. Same engine base, full source SH, resolution and zero size/contribution cutoffs. Two reversed-order trials per configuration; the two city inputs are levels of the same scan.

This comparison is against **PlayCanvas full quality, not stock defaults**. Stock defaults and other renderers were not rerun. Earlier results below include losses; this isn't a claim to be the fastest renderer on every scene or device. [Latest results, image error and per-frame data](packages/splat-lod/benchmark/measurements/2026-09-06-benefit-rerun/README.md) · [Reproduce](packages/splat-lod/benchmark/BENEFIT.md).

### What quality does the reduced version retain?

These are the **fixed-LOD controls from that same v0.3 run**, measured against full-quality PlayCanvas. Lower frame time is better; higher foreground PSNR is better.

| Input | Fixed LOD moving mean | Fixed LOD minimum foreground PSNR |
| --- | ---: | ---: |
| Bumblebee | 6.09 ms | 28.58 dB |
| Ekotori shop | 10.56 ms | 31.55 dB |
| Lublin · published LOD 4 | 26.73 ms | 36.81 dB |
| Lublin · published LOD 3 | 44.84 ms | 37.61 dB |

Automatic mode can switch to originals during the separate image captures. Its higher PSNR on those captures is **not** the quality of its LOD-rendered timing frames. Five poses are sampled; this is not an all-angle or temporal-quality guarantee.
<!-- benefit-rerun:end -->

<!-- multi-scene-benchmark:start -->
## Multi-scene benchmarks — PlayCanvas, Spark and luma.gl

**Historical same-run comparison, September 6, 2026 UTC:** our v0.1.0 bundle, PlayCanvas 2.22.0, Spark 2.1.0 and luma.gl 9.4.0. These are not new v0.3 measurements. Three complete SH3 scenes at 2560×1440 on an Apple M5 Max with 128 GiB RAM; two reversed-order trials, 6,480 timed frames.

Median frame times while moving the camera, including current-view sorting and GPU completion—not interactive FPS. Bold is the fastest measured renderer; speedup is versus the next-fastest. Margins within 5% are near-ties, not established wins:

| Scene / original splats | Our v0.1, LOD 2× | PC 2.22 defaults | PC 2.22 full quality | Spark 2.1¹ | luma.gl 9.4² | Fastest | Over next-best |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Cicada Shell · 0.65M | 5.21 ms | **4.84 ms** | 5.29 ms | 19.77 ms | 6.32 ms | PC defaults | 1.08× |
| Bumblebee · 2.32M | 5.39 ms | **4.93 ms** | 8.61 ms | 29.00 ms | 10.39 ms | PC defaults | 1.09× |
| Ekotori shop · 7.08M | **10.10 ms** | 10.85 ms | 16.83 ms | 88.80 ms | 24.04 ms | Splat LOD v0.1 | 1.07× |

Minimum foreground RGB PSNR across five poses and both trials, against same-trial **PC full quality**. Higher is better; the reference compared with itself has zero error. These quality values come from the same configurations and cohort as the speed table.

| Scene | Our v0.1, LOD 2× | PC defaults | Spark 2.1 | luma.gl 9.4 |
| --- | ---: | ---: | ---: | ---: |
| Cicada Shell | 27.08 dB | 33.07 dB | 33.11 dB | 30.64 dB |
| Bumblebee | 28.58 dB | 18.04 dB | 32.90 dB | 28.73 dB |
| Ekotori shop | 31.55 dB | 41.98 dB | 37.58 dB | 38.22 dB |

In this run, v0.1 is slower than PC defaults on the bee and cicada. The shop is 1.07× faster at the median, but loses quality and has bad frame-time spikes: p95 is 43.51 ms versus 12.93 ms. Faster is not automatically better: Spark and luma.gl retain more foreground detail than our LOD in these tests.

PC defaults keeps its size/contribution cutoffs and cached-SH threshold; full quality disables those approximations. Foreground PSNR avoids diluting error with empty background, but is still only a five-pose test. The LOD setting of 2× changes transition distances; it doesn't mean twice the FPS.

¹ Spark's completed-frame test waits for a current-camera sort. Its normal asynchronous loop is timed separately, so this is not a claim that its interactive FPS is this much slower. ² luma.gl's renderer is experimental. All use SH3, but parameter packing, projection/filtering and sorting differ.

[Full results, p95 and interactive timings](packages/splat-lod/BENCHMARKS.md) · [Pinned versions and methodology](packages/splat-lod/benchmark/README.md) · [Raw measurements](packages/splat-lod/benchmark/measurements/2026-09-05/summary.json)

<!-- multi-scene-benchmark:end -->

</details>

<details>
<summary>First v0.3 run: automatic LOD versus our original-splat path</summary>

<!-- benefit-benchmark:start -->
## LOD only when it helps

v0.3 starts with the original splats, measures both paths, and keeps LOD only when it is cheaper. The fallback bypasses cube selection, prefix scans and range lookup. Same SH, culling and resolution either way.

Moving-camera results on an Apple M5 Max, 2560×1440. Four inputs, four configurations, two reversed-order trials; **5,760 timed frames**, with probe frames included. Completed-frame latency includes a GPU completion fence; it is not interactive FPS.

| Input | Direct mean / median / p95 | Automatic mean / median / p95 | Mean speedup |
| --- | ---: | ---: | ---: |
| Bumblebee | 6.77 / 6.73 / 7.44 ms | 5.25 / 4.82 / 7.38 ms | 1.29× |
| Ekotori shop | 11.54 / 11.42 / 12.60 ms | 7.79 / 7.72 / 8.10 ms | 1.48× |
| Lublin city · published LOD 4 | 44.37 / 43.77 / 55.30 ms | 20.03 / 19.87 / 24.52 ms | 2.21× |
| Lublin city · published LOD 3 | 87.82 / 85.98 / 108.36 ms | 34.65 / 35.09 / 40.08 ms | 2.53× |

These four paths benefited from LOD. A separate live no-reduction control verified fallback when LOD cost more. Automatic selection is not free: brief probes can run the losing path. The full report includes fixed-LOD controls, warmups, tails and the actual path used for each image.

LOD is still lossy. On abrupt jumps, automatic quality captures can use originals; their higher PSNR is **not** the quality of the faster LOD frames. [All results and caveats](packages/splat-lod/BENEFIT-BENCHMARKS.md) · [Reproduce](packages/splat-lod/benchmark/BENEFIT.md).
<!-- benefit-benchmark:end -->

</details>

<details>
<summary>Previous release: v0.2 fixed-LOD comparison on PlayCanvas main</summary>

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

</details>

## How it works

1. Split the scene into cubes.
2. Merge splats within each cube to make half-, quarter- and eighth-count versions. Keep the originals too.
3. On the GPU, pick a version for each cube based on its size on screen.
4. Project the selected splats, evaluate their SH for the visible ones, then depth-sort and render them together.

Automatic mode measures whether those LOD steps pay for themselves. If they don't, it skips them and projects the original source bank directly.

Splat IDs stay tied to the scene. Changing the view selects ranges of IDs instead of rebuilding the whole list on the CPU. The final output is still splats—no impostors or cached images.

[Changes from stock PlayCanvas](packages/splat-lod/CHANGES.md)

## Use it

```sh
npm install https://github.com/ShinMegamiBoson/splat-lod/releases/download/splat-lod-v0.3.0/shinmegami-boson-splat-lod-0.3.0.tgz
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

[Setup, preprocessing and API](packages/splat-lod/README.md) · [Download](https://github.com/ShinMegamiBoson/splat-lod/releases/tag/splat-lod-v0.3.0)

## Limits

Still experimental. WebGPU only, static scenes, perspective cameras, SH0 or SH3. All four LOD versions stay resident, so this uses more memory than the original splats. No streaming.

Rebased onto [PlayCanvas main, d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63) (2.23.0-beta.2). It uses private projection APIs, so engine upgrades need testing. The upstream engine is still in this repo; its docs are in [README.upstream.md](README.upstream.md).

[MIT](LICENSE), with PlayCanvas's copyright retained. Not an official PlayCanvas package. The test scans have their own licenses and aren't included; the demo uses a generated scene.
