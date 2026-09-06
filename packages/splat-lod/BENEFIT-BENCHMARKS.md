# Automatic LOD: cost and fallback

Recorded September 6, 2026. Apple M5 Max, 128 GiB, macOS 26.4, Chrome 152 / WebGPU Metal 3. Same PlayCanvas main d753e98 on all paths. Fixed 2560×1440 framebuffer and 1280×720 CSS viewport.

All 32 cases passed. Independent NumPy verification checked 160 image pairs, 5,760 timed frames, 4,096 warmups and every consecutive direct-path transition for skipped selection/prefix work. These are new v0.3 results; older release measurements are unchanged.

## Read this before comparing PSNR

The speed selector is active during automatic timings, including its rechecks. The five image captures jump between poses separately. Bee and shop fall back to originals during those jumps; do not pair their automatic timing with that near-original PSNR and call it lossless. The fixed-LOD row measures the approximation used by LOD. The path of every automatic image is listed below.

Differences between automatic and fixed-LOD timing are not a new rasterizer optimization. Their steady LOD code is the same; probing changes GPU load, history and timing. Two trials on one device are not statistical evidence that the selector makes the LOD path itself faster.

## Bumblebee

2,315,943 source splats, SH3. [Source / creator: Dany Bittel (danylyon)](https://superspl.at/scene/cf6ac78e).

| Configuration | Static mean / median / p95 | Moving mean / median / p95 | Interactive RAF/s, trials 1 / 2 | Min foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 6.62 / 6.57 / 7.20 ms | 7.20 / 7.10 / 7.87 ms | 120.00 / 119.98 | — dB |
| Our originals, direct | 6.85 / 6.80 / 7.46 ms | 6.77 / 6.73 / 7.44 ms | 120.00 / 120.24 | 67.10 dB |
| Fixed LOD 2× | 6.14 / 6.29 / 7.14 ms | 6.05 / 6.06 / 6.93 ms | 120.27 / 120.00 | 28.58 dB |
| Automatic (includes probes) | 5.20 / 5.15 / 6.62 ms | 5.25 / 4.82 / 7.38 ms | 120.11 / 120.00 | 67.17 dB |

| Automatic trial | Moving probe frames | Interactive probe frames | Paths in the five quality captures |
| --- | ---: | ---: | --- |
| 1 | 32/90 | 64/481 | direct, direct, direct, direct, direct |
| 2 | 32/90 | 64/481 | direct, direct, direct, direct, direct |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 7.32 ms | 6.96 ms |
| Our originals, direct | 6.79 ms | 6.67 ms |
| Fixed LOD 2× | 5.72 ms | 6.21 ms |
| Automatic (includes probes) | 4.50 ms | 5.01 ms |

</details>

## Ekotori shop

7,081,853 source splats, SH3. [Source / creator: J (jjames)](https://superspl.at/scene/8fa2ded1).

| Configuration | Static mean / median / p95 | Moving mean / median / p95 | Interactive RAF/s, trials 1 / 2 | Min foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 11.29 / 11.14 / 12.15 ms | 13.38 / 13.32 / 14.81 ms | 78.92 / 77.68 | — dB |
| Our originals, direct | 11.31 / 11.16 / 12.27 ms | 11.54 / 11.42 / 12.60 ms | 92.74 / 90.54 | 60.96 dB |
| Fixed LOD 2× | 7.53 / 7.34 / 8.63 ms | 7.94 / 7.83 / 8.91 ms | 119.99 / 119.99 | 31.55 dB |
| Automatic (includes probes) | 7.88 / 7.76 / 8.41 ms | 7.79 / 7.72 / 8.10 ms | 119.53 / 119.50 | 60.45 dB |

| Automatic trial | Moving probe frames | Interactive probe frames | Paths in the five quality captures |
| --- | ---: | ---: | --- |
| 1 | 1/90 | 33/479 | direct, direct, direct, direct, direct |
| 2 | 1/90 | 33/479 | direct, direct, direct, direct, direct |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 13.22 ms | 13.47 ms |
| Our originals, direct | 11.27 ms | 11.57 ms |
| Fixed LOD 2× | 7.47 ms | 8.27 ms |
| Automatic (includes probes) | 7.72 ms | 7.72 ms |

</details>

## Lublin city · published LOD 4

16,184,440 source splats, SH0. [Source / creator: Andrii Shramko, Teleportour](https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json).

| Configuration | Static mean / median / p95 | Moving mean / median / p95 | Interactive RAF/s, trials 1 / 2 | Min foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 45.14 / 45.07 / 52.68 ms | 43.41 / 42.44 / 55.68 ms | 26.25 / 22.68 | — dB |
| Our originals, direct | 40.59 / 40.98 / 49.52 ms | 44.37 / 43.77 / 55.30 ms | 22.47 / 24.15 | 60.55 dB |
| Fixed LOD 2× | 17.25 / 16.83 / 21.05 ms | 18.65 / 18.60 / 22.80 ms | 51.95 / 57.15 | 36.80 dB |
| Automatic (includes probes) | 22.13 / 22.53 / 25.61 ms | 20.03 / 19.87 / 24.52 ms | 49.44 / 51.16 | 36.81 dB |

| Automatic trial | Moving probe frames | Interactive probe frames | Paths in the five quality captures |
| --- | ---: | ---: | --- |
| 1 | 0/90 | 0/199 | lod, lod, lod, lod, lod |
| 2 | 0/90 | 0/205 | lod, lod, lod, lod, lod |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 40.12 ms | 44.26 ms |
| Our originals, direct | 44.87 ms | 43.07 ms |
| Fixed LOD 2× | 19.19 ms | 18.45 ms |
| Automatic (includes probes) | 19.82 ms | 20.00 ms |

</details>

## Lublin city · published LOD 3

32,368,879 source splats, SH0. [Source / creator: Andrii Shramko, Teleportour](https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json).

| Configuration | Static mean / median / p95 | Moving mean / median / p95 | Interactive RAF/s, trials 1 / 2 | Min foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 77.72 / 77.35 / 94.79 ms | 83.45 / 82.04 / 104.03 ms | 12.77 / 13.10 | — dB |
| Our originals, direct | 76.33 / 74.92 / 86.58 ms | 87.82 / 85.98 / 108.36 ms | 12.07 / 12.23 | 58.52 dB |
| Fixed LOD 2× | 35.66 / 33.97 / 45.46 ms | 38.48 / 38.75 / 48.80 ms | 23.37 / 28.08 | 37.61 dB |
| Automatic (includes probes) | 34.25 / 32.95 / 42.57 ms | 34.65 / 35.09 / 40.08 ms | 29.38 / 27.63 | 37.61 dB |

| Automatic trial | Moving probe frames | Interactive probe frames | Paths in the five quality captures |
| --- | ---: | ---: | --- |
| 1 | 0/90 | 0/118 | lod, lod, lod, lod, lod |
| 2 | 0/90 | 0/111 | lod, lod, lod, lod, lod |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 85.07 ms | 79.05 ms |
| Our originals, direct | 90.68 ms | 83.68 ms |
| Fixed LOD 2× | 42.34 ms | 37.65 ms |
| Automatic (includes probes) | 36.24 ms | 34.06 ms |

</details>

## Fallback and limitations

A separate live SH0 torus control used multiplier 0.001 so all 328 visible chunks retained their 16,384 originals. One saved comparison measured direct cost 2.523136 ms and LOD cost 2.949120 ms; automatic mode chose direct. A later multiplier-2 sample gained only 1.41% and also chose direct. Eight moving-source frames produced zero selection passes, zero prefix scans and eight source dispatches. These are asynchronous policy cost estimates, not fence timing or display FPS. Rechecks may choose differently as costs vary; these saved decisions are not an always-direct assertion for the torus. [Raw controls](benchmark/measurements/2026-09-06-benefit/fallback-controls.json) · [Installed-package checks](VALIDATION-v0.3.json).

LOD requires a 10% median cost win to turn on, then at least 3% to stay on; its sampled p95 must stay within 10% of direct. These thresholds were fixed before the cohort. Short probes can use the slower representation, and measurements can become stale. No claim that every frame is faster; no crossfade or hidden quality reduction.

All controls keep full source SH, zero size/contribution cutoffs, current-view global GPU sorting and the same framebuffer. Direct avoids LOD bookkeeping but does not unload the three replacement banks. All four banks remain resident. The city inputs are two published LOD levels of the same Lublin scan, not two independent scenes or the full 259M original.

Completed-frame timing includes preparation, submission and waiting for GPU completion. The runtime selector itself inserts no completion fence. Interactive RAF/s counts callbacks, not measured physical presentation. Warmups are retained separately. PSNR uses reference-only foreground masking at 3/255, not a true alpha matte; five poses do not certify all-angle or temporal quality.

## Reproduce

[Protocol and commands](benchmark/BENEFIT.md) · [Summary](benchmark/measurements/2026-09-06-benefit/summary.json) · [Every frame](benchmark/measurements/2026-09-06-benefit/runs) · [Probe counts](benchmark/measurements/2026-09-06-benefit/paths.json) · [Verification](benchmark/measurements/2026-09-06-benefit/verification.json) · [Attempt ledger](benchmark/measurements/2026-09-06-benefit/attempts.json).

Executed feature revision: 287163a6e2f389a6f0b84c740c74531cf8ddb9da. Runtime SHA-256: 6411f9e357dd3e07b469c2d2b6231ab8d0a898391feb89451d3aee68b3a12213. Harness SHA-256: f9c392c729a1b7efa9a76e7d06c956ddf082f0f7dd3002dacae18db1c46292d8. Later report and example changes do not change these tested runtime bytes.

Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com). No scan assets or captures are redistributed.
