# PlayCanvas-main and large-scene benchmarks

Recorded September 6, 2026. Apple M5 Max, 128 GiB, macOS 26.4 (25E246), WebGPU / Metal 3. Fixed framebuffer 2560×1440, CSS viewport 1280×720, explicit 2× backing resolution. The controlled browser viewport reports DPR 1; the harness sets framebuffer dimensions independently. Browser: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36.

Both the fork and stock controls use upstream main `d753e98c70d67b755754c614f383d215cacbbd63`. The stock renderer code is unmodified. This is a new v0.2 result, not a reranking of the [v0.1 PlayCanvas / Spark / luma.gl comparison](BENCHMARKS.md). Those other renderers were not rerun in this batch.

All 56 cases completed: four inputs × seven configurations × two reversed-order trials. **10,080 completed-frame samples, 56 four-second interactive passes and 280 full-resolution quality captures.** [Independent NumPy verification](benchmark/measurements/2026-09-06/verification.json) recomputed every pixel comparison and timing row.

## Bumblebee

2,315,943 input splats, SH3, cube edge 0.03 scene units. LOD selected 1,155,408–1,155,408 splats across the five quality poses. [Source / creator: Dany Bittel (danylyon)](https://superspl.at/scene/cf6ac78e).

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 7.03 ms | 7.85 / 9.30 ms | 120.00 / 120.00 | — / — dB |
| Our LOD 2×, no extra culling | 5.78 ms | 6.89 / 8.58 ms | 119.99 / 119.96 | 39.53 / 28.58 dB |
| Our LOD + contribution 3 | 5.15 ms | 4.71 / 7.11 ms | 106.39 / 115.13 | 30.46 / 19.03 dB |
| Our LOD + PC culling | 4.25 ms | 5.16 / 7.93 ms | 93.42 / 119.97 | 30.46 / 19.03 dB |
| Our LOD + PC culling + cached SH | 5.43 ms | 5.40 / 7.82 ms | 120.00 / 120.01 | 30.32 / 18.89 dB |
| PC defaults | 6.27 ms | 5.31 / 7.18 ms | 119.94 / 120.00 | 29.47 / 18.04 dB |
| Ours, LOD off | 7.88 ms | 7.92 / 9.17 ms | 119.98 / 119.99 | 77.78 / 66.51 dB |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 7.90 ms | 7.76 ms |
| Our LOD 2×, no extra culling | 6.73 ms | 6.97 ms |
| Our LOD + contribution 3 | 3.96 ms | 5.32 ms |
| Our LOD + PC culling | 4.92 ms | 5.48 ms |
| Our LOD + PC culling + cached SH | 5.98 ms | 5.02 ms |
| PC defaults | 5.97 ms | 4.64 ms |
| Ours, LOD off | 8.29 ms | 7.73 ms |

</details>

## Ekotori shop

7,081,853 input splats, SH3, cube edge 0.5 scene units. LOD selected 2,020,047–2,155,557 splats across the five quality poses. [Source / creator: J (jjames)](https://superspl.at/scene/8fa2ded1).

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 11.74 ms | 13.76 / 46.74 ms | 73.67 / 77.71 | — / — dB |
| Our LOD 2×, no extra culling | 7.60 ms | 8.04 / 8.61 ms | 119.99 / 120.00 | 31.55 / 31.55 dB |
| Our LOD + contribution 3 | 7.26 ms | 7.58 / 8.20 ms | 120.00 / 120.00 | 31.51 / 31.51 dB |
| Our LOD + PC culling | 7.50 ms | 7.66 / 8.19 ms | 120.02 / 120.02 | 31.51 / 31.51 dB |
| Our LOD + PC culling + cached SH | 7.09 ms | 7.66 / 14.54 ms | 120.00 / 120.00 | 31.51 / 31.51 dB |
| PC defaults | 9.73 ms | 9.81 / 11.78 ms | 105.78 / 105.50 | 41.98 / 41.98 dB |
| Ours, LOD off | 12.57 ms | 12.96 / 13.58 ms | 82.48 / 80.98 | 56.99 / 56.99 dB |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 16.30 ms | 13.39 ms |
| Our LOD 2×, no extra culling | 8.14 ms | 7.91 ms |
| Our LOD + contribution 3 | 7.67 ms | 7.55 ms |
| Our LOD + PC culling | 7.69 ms | 7.63 ms |
| Our LOD + PC culling + cached SH | 7.81 ms | 7.45 ms |
| PC defaults | 9.79 ms | 9.83 ms |
| Ours, LOD off | 13.11 ms | 12.78 ms |

</details>

## Lublin city · published LOD 4

16,184,440 input splats, SH0, cube edge 16 scene units. LOD selected 5,674,561–6,348,857 splats across the five quality poses. [Source / creator: Andrii Shramko, Teleportour](https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json).

Entire published LOD 4, not the 258,951,032-splat original; no extra point filtering.

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 36.58 ms | 38.29 / 44.37 ms | 30.00 / 24.50 | — / — dB |
| Our LOD 2×, no extra culling | 16.94 ms | 18.41 / 20.67 ms | 59.42 / 46.99 | 38.55 / 36.80 dB |
| Our LOD + contribution 3 | 16.40 ms | 17.40 / 20.04 ms | 60.13 / 52.46 | 38.20 / 36.45 dB |
| Our LOD + PC culling | 16.48 ms | 17.56 / 19.53 ms | 59.91 / 59.52 | 38.20 / 36.45 dB |
| Our LOD + PC culling + cached SH | 16.45 ms | 17.40 / 19.53 ms | 60.46 / 60.32 | 38.20 / 36.45 dB |
| PC defaults | 28.36 ms | 28.04 / 30.57 ms | 37.75 / 37.35 | 41.72 / 39.85 dB |
| Ours, LOD off | 35.20 ms | 34.38 / 38.02 ms | 30.94 / 30.97 | 60.61 / 58.84 dB |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 34.46 ms | 41.05 ms |
| Our LOD 2×, no extra culling | 18.19 ms | 18.52 ms |
| Our LOD + contribution 3 | 17.43 ms | 17.30 ms |
| Our LOD + PC culling | 17.56 ms | 17.51 ms |
| Our LOD + PC culling + cached SH | 17.53 ms | 17.39 ms |
| PC defaults | 27.98 ms | 28.13 ms |
| Ours, LOD off | 34.37 ms | 34.46 ms |

</details>

## Lublin city · published LOD 3

32,368,879 input splats, SH0, cube edge 16 scene units. LOD selected 11,695,803–13,098,305 splats across the five quality poses. [Source / creator: Andrii Shramko, Teleportour](https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json).

Entire published LOD 3, not the 258,951,032-splat original; no extra point filtering.

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PC full quality | 60.69 ms | 65.51 / 78.19 ms | 14.97 / 17.96 | — / — dB |
| Our LOD 2×, no extra culling | 28.58 ms | 30.67 / 34.33 ms | 31.89 / 34.98 | 39.37 / 37.60 dB |
| Our LOD + contribution 3 | 25.85 ms | 27.01 / 40.94 ms | 39.68 / 38.00 | 35.43 / 33.57 dB |
| Our LOD + PC culling | 25.97 ms | 27.33 / 30.38 ms | 39.82 / 37.73 | 35.43 / 33.57 dB |
| Our LOD + PC culling + cached SH | 27.19 ms | 28.35 / 32.85 ms | 34.98 / 37.79 | 35.43 / 33.57 dB |
| PC defaults | 37.18 ms | 37.16 / 41.26 ms | 28.60 / 28.65 | 34.56 / 32.69 dB |
| Ours, LOD off | 62.13 ms | 63.53 / 72.90 ms | 16.26 / 17.39 | 59.21 / 57.43 dB |

<details>
<summary>Moving medians in each trial</summary>

| Configuration | Trial 1 | Trial 2 |
| --- | ---: | ---: |
| PC full quality | 71.90 ms | 60.43 ms |
| Our LOD 2×, no extra culling | 30.68 ms | 30.62 ms |
| Our LOD + contribution 3 | 26.98 ms | 27.14 ms |
| Our LOD + PC culling | 26.89 ms | 27.57 ms |
| Our LOD + PC culling + cached SH | 29.88 ms | 27.74 ms |
| PC defaults | 37.09 ms | 37.24 ms |
| Ours, LOD off | 65.59 ms | 62.71 ms |

</details>

## Which defaults changed?

None. The default remains LOD multiplier 2 with `renderSettings: { profile: 'exact', shMode: 'visible' }`. LOD merging is still lossy. The word exact here means no additional projector cutoff, not exact replacement Gaussians.

The adoption rule was written before the run: at least 5% lower moving median, no more than 0.5 dB lost minimum foreground PSNR, and no more than 20% higher moving p95, on the two selection inputs and both larger validation inputs. No candidate passed all of that. [Every delta and decision](benchmark/measurements/2026-09-06/optimization-decision.json).

Contribution culling is useful on the shop and 16M input, but drops too much detail on the bee and 32M input. Adding the two-pixel cutoff produced nearly the same minimum PSNR as contribution-only, but the images are not bit-identical and it showed no consistent extra speed benefit. Cached SH was not consistently faster and worsened the shop’s p95. SH0 city results cannot demonstrate a benefit from SH reuse.

All three options are implemented and explicit: `profile: 'contribution'`, `profile: 'playcanvas'`, and `shMode: 'cached'` with an optional `colorUpdateAngle`. [API](README.md#rendering-settings).

## What is and is not measured

- Completed-frame latency includes camera preparation, current-view global GPU sorting, draw submission and a GPU completion fence. Downloads, initialization, preprocessing and image readback are excluded. Each row pools 180 static and 180 moving samples, after 20 warmups per phase per trial.
- Interactive RAF/s counts callbacks submitting frames along a four-second path with no per-frame fence. It is not measured physical presentation, a latency guarantee or uncapped FPS; some results hit the browser’s 120 Hz ceiling.
- PC defaults keeps upstream minPixelSize=2, minContribution=3, cached color updates at 10 degrees, default source format/reorder and budget. PC full quality uses zero cutoffs, current-view SH and decompressed, unreordered originals. Both use the same camera, resolution, opaque background and no tone mapping. Flat PLY banks do not use the streaming-LOD splat budget.
- PSNR compares five ordered poses to the same-trial full-quality reference. Foreground uses only reference RGB differing from the background by more than 3/255, not a true alpha matte. “—” means zero reference-versus-itself error. Short paths and two trials do not certify all-angle, temporal or perceptual quality.
- All four banks remain resident: roughly 1.875× the source records, plus working buffers. The 32M input has 60,697,057 resident records. This is not a streaming or memory-saving result.
- The two city rows are related published LODs of one scan. They are large-input stress tests, not independent scene diversity. Native SH0 stays SH0; bee and shop keep all SH3 terms. No scene or derived image is redistributed.
- One device, one browser backend, two trials. Per-trial variation and long-tail frames remain in the report; no significance or universal-speedup claim.

## Reproduce and inspect

[Setup and pinned inputs](benchmark/MAIN.md) · [Summary](benchmark/measurements/2026-09-06/summary.json) · [Every per-frame sample, settings and image-error numerator](benchmark/measurements/2026-09-06/runs) · [Case selection](benchmark/measurements/2026-09-06/case-selection.json) · [Attempt ledger](benchmark/measurements/2026-09-06/attempts.json).

Executed feature/harness revision: `371cddb4226e49aab757f18cd0625690a485fe68`. Standalone SHA-256: `c3123256856c66248a8c3ee106e1e38a5b30c59bdee105cd96519b4336dec8de`. Upstream bundle SHA-256: `5ead0f0e40c318bf97a5839f68a9f151c851c6cd1cfca82cd8e75c46b4f23138`. Executed harness SHA-256: `0ab4851356b4f65e7ab562ad88058dae539ad83312cdf93ff15a67646df3e430`. Later report/package changes do not change the tested runtime bytes.

Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com). [Dataset terms](https://drive.google.com/uc?export=download&id=1QIhzn0LUWgOZUBzX5ethVEPgog6bUaSb).
