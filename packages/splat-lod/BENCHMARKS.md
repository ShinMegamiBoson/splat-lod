# Multi-scene renderer benchmark

Recorded September 5, 2026 local time (September 6 UTC), using the **standalone v0.1.0 runtime bundle**. Hardware: Apple M5 Max, 128 GiB, macOS 26.4, Metal 3. Browser: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36. Physical framebuffer **2560×1440**; fixed CSS viewport **1280×720**, DPR 2.

Three complete scenes × six configurations × two counterbalanced trials. **6,480 timed completed frames**, 36 four-second interactive passes, and 180 full-resolution quality captures. All 36 cases completed. No scene or derived image is redistributed.

## Cicada Shell

[Source / creator: tokoyoshi](https://superspl.at/scene/cbe96076) · 652,804 originals · cube edge 0.08 scene units. Our LOD selected **327,883–335,899** splats across the five quality poses.

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PlayCanvas 2.22 full quality | 5.28 ms | 5.29 / 7.05 ms | 119.98 / 119.99 | — / — dB |
| Ours · 2× sooner LOD | 4.99 ms | 5.21 / 6.58 ms | 119.97 / 120.01 | 37.60 / 27.08 dB |
| PlayCanvas 2.22 defaults | 4.87 ms | 4.84 / 6.57 ms | 120.01 / 119.98 | 43.61 / 33.07 dB |
| Ours · LOD off | 5.13 ms | 5.70 / 23.90 ms | 120.03 / 120.00 | 69.19 / 58.41 dB |
| Spark 2.1 · fresh sort | 9.01 ms | 19.77 / 21.25 ms | 120.03 / 120.02 | 43.67 / 33.11 dB |
| luma.gl 9.4 · experimental | Cached, no redraw | 6.32 / 8.30 ms | 119.74 / 116.75 | 42.04 / 30.64 dB |

## Bumblebee

[Source / creator: Dany Bittel (danylyon)](https://superspl.at/scene/cf6ac78e) · 2,315,943 originals · cube edge 0.03 scene units. Our LOD selected **1,155,408–1,155,408** splats across the five quality poses.

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PlayCanvas 2.22 full quality | 7.64 ms | 8.61 / 11.21 ms | 91.33 / 119.75 | — / — dB |
| Ours · 2× sooner LOD | 5.54 ms | 5.39 / 6.71 ms | 119.99 / 120.00 | 39.53 / 28.58 dB |
| PlayCanvas 2.22 defaults | 5.42 ms | 4.93 / 6.26 ms | 120.24 / 119.99 | 29.47 / 18.04 dB |
| Ours · LOD off | 8.06 ms | 8.38 / 11.30 ms | 119.75 / 92.70 | 77.80 / 66.49 dB |
| Spark 2.1 · fresh sort | 9.62 ms | 29.00 / 36.05 ms | 119.15 / 117.60 | 44.01 / 32.90 dB |
| luma.gl 9.4 · experimental | Cached, no redraw | 10.39 / 13.12 ms | 78.17 / 75.16 | 40.16 / 28.73 dB |

## Ekotori shop

[Source / creator: J (jjames)](https://superspl.at/scene/8fa2ded1) · 7,081,853 originals · cube edge 0.5 scene units. Our LOD selected **2,020,047–2,155,557** splats across the five quality poses.

| Configuration | Static median | Moving median / p95 | Interactive RAF/s, trials 1 / 2 | Min RGB / foreground PSNR |
| --- | ---: | ---: | ---: | ---: |
| PlayCanvas 2.22 full quality | 13.66 ms | 16.83 / 18.14 ms | 54.52 / 62.24 | — / — dB |
| Ours · 2× sooner LOD | 8.75 ms | 10.10 / 43.51 ms | 108.12 / 111.86 | 31.55 / 31.55 dB |
| PlayCanvas 2.22 defaults | 10.48 ms | 10.85 / 12.93 ms | 88.90 / 95.05 | 41.98 / 41.98 dB |
| Ours · LOD off | 14.63 ms | 15.97 / 17.98 ms | 70.21 / 68.47 | 57.15 / 57.15 dB |
| Spark 2.1 · fresh sort | 18.58 ms | 88.80 / 113.62 ms | 56.94 / 51.64 | 37.58 / 37.58 dB |
| luma.gl 9.4 · experimental | Cached, no redraw | 24.04 / 28.87 ms | 42.61 / 43.23 | 38.22 / 38.22 dB |

## How to read these numbers

- **Completed-frame latency**, not GPU-only time: camera preparation, current-view sorting, draw submission and GPU completion fence are included. Readbacks and loading are excluded. There are 180 static and 180 moving samples per scene/configuration. Medians and p95 are pooled across two trials; individual trials and every sample are retained.
- **Interactive RAF/s** counts browser animation callbacks submitting frames, not physically presented frames. The path runs for four seconds without a per-frame GPU fence; the browser may cap cadence around 120 Hz, queue GPU work, or reuse stale sorting. Do not substitute these values for fresh-view latency. Spark's per-callback sort lag is recorded.
- **Default ≠ full quality.** Stock defaults retain their 2-pixel size filter, minimum contribution 3, SH update angle 10°, source format, reorder and budget. The reference disables those approximations, uses current-view SH3 and decompressed parameters. Both use the same camera, output size, background and no tone mapping.
- **LOD is lossy.** Foreground PSNR is intentionally reported because background inflates full-image PSNR. The foreground mask is a reference-only RGB/background threshold, not a true alpha silhouette. Five path poses cannot certify all-angle or temporal quality. Reference-versus-itself PSNR is exact (shown as —).
- **Different renderers, different pixels.** Spark adds PackedSplats quantization and uses asynchronous worker sorting in its interactive loop; its completed-frame test waits for a current-camera sort. luma.gl uses Float32 SH3 pages, a 16-bit global depth key, and different projection/filtering. Its unchanged static scene is reused, not newly rendered, so its static cached latency is not ranked.
- **Memory is not reduced.** Ours keeps original and three replacement banks resident, approximately 1.875× the source record count before working buffers. This benchmark excludes preprocessing, downloads, load time and peak-memory measurement.
- **Limited evidence.** One device/browser, two trials and short paths; no universal ranking, significance test, mobile qualification, or negligible-error claim. The unreported development pass ran alongside tooling work, changed browser CSS size and eventually hit allocation failures; it was used for harness validation, not mixed into this frozen production-build result.

## Large-scene isolation

The two object scenes use the frozen production batch `multi-scene-20260906-r2`. Every shop case was rerun, in the prescribed order, in its own independently closed tab (`multi-scene-20260906-r4`), with the viewport set before starting. Repeated large-scene loads in one embedded-browser tab hit allocation failures even after history replacement; those attempts are excluded as failed setup, not ranked as rendering performance. This lifetime issue is not claimed to be fixed in the engines. All shop configurations use the same isolation procedure, and no case was chosen because it was faster. Original run IDs and failed-batch statuses are retained with the evidence.

## Reproduction and provenance

Independent [Python/NumPy verification](benchmark/measurements/2026-09-05/verification.json) recomputed all 180 image comparisons and all 18 timing rows. [Case selection](benchmark/measurements/2026-09-05/case-selection.json) and [development-attempt statuses](benchmark/measurements/2026-09-05/development-attempts.json) retain the setup failures and exact inclusion boundary.



[Run the pinned harness](benchmark/README.md). [Summary, settings and hardware](benchmark/measurements/2026-09-05/summary.json). [All per-frame timing samples, quality numerators and capture hashes](benchmark/measurements/2026-09-05/runs).

- Harness revision: `3c4f11ea9f2266670e92f3a6f97026265772fd68`.
- Executed production harness SHA-256: `dd20a08054f778b6a2db2aa2a63bc3198f723047ced78f31124ebce36f6a168e`.
- Standalone bundle SHA-256: `93f755175d0ee59273bd3e61f68a8879b8fcfcfa8b60a7cd3a008341b1afdfc1`, verified equal to the previously installed release package.
- Sources, camera transforms, clipping planes, cube sizes and immutable input hashes: [scenes.mjs](benchmark/scenes.mjs).

The comparison covers PlayCanvas, Spark and luma.gl, not every renderer. GaussianSplats3D and gsplat.js were surveyed but excluded from SH3 headline comparisons; their limitations and primary-source links are in the [methodology](benchmark/README.md).
