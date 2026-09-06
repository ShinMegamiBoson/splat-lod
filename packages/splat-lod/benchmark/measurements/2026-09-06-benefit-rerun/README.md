# v0.3 benchmark rerun

Recorded September 6, 2026, using the unchanged released v0.3 runtime. Apple M5 Max, 128 GiB, macOS 26.4, Chromium 152 / WebGPU Metal 3, 2560×1440 framebuffer. Same PlayCanvas base on both sides: [d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63), 2.23.0-beta.2.

All 32 cases passed: four inputs, four configurations, two reversed-order trials. Independent NumPy verification checked 5,760 timed frames, 4,096 warmups, 160 image pairs and 4,581 consecutive direct-path transitions. No case was dropped or replaced.

## Moving-camera results

| Input | PC full quality mean | Our originals mean | Fixed LOD 2× mean | Automatic mean | Auto speedup vs PC / ours |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bumblebee · 2,315,943 splats | 8.46 ms | 9.83 ms | 6.09 ms | 5.83 ms | 1.45× / 1.69× |
| Ekotori shop · 7,081,853 splats | 21.15 ms | 18.66 ms | 10.56 ms | 9.74 ms | 2.17× / 1.92× |
| Lublin · published LOD 4 · 16,184,440 splats | 50.40 ms | 48.81 ms | 26.73 ms | 27.42 ms | 1.84× / 1.78× |
| Lublin · published LOD 3 · 32,368,879 splats | 81.98 ms | 80.39 ms | 44.84 ms | 47.04 ms | 1.74× / 1.71× |

Completed-frame latency includes preparation, submission, sorting and a GPU completion fence. All probe frames are included. This is not interactive FPS. PC here is full quality: full source SH, zero size/contribution cutoffs and current-view global GPU sorting. Our paths use those same settings, but LOD changes the splats and is lossy. Stock defaults and other libraries were not rerun; this is not an overall renderer ranking.

| Input | PC moving median / p95 | Automatic moving median / p95 |
| --- | ---: | ---: |
| Bumblebee | 8.27 / 10.14 ms | 5.20 / 8.47 ms |
| Ekotori shop | 20.34 / 24.73 ms | 9.66 / 11.65 ms |
| Lublin · published LOD 4 | 49.76 / 63.17 ms | 26.82 / 35.02 ms |
| Lublin · published LOD 3 | 79.57 / 105.28 ms | 46.89 / 57.37 ms |

## Image quality is a separate measurement

| Input | Fixed-LOD minimum foreground PSNR | Automatic image-capture paths, both trials |
| --- | ---: | --- |
| Bumblebee | 28.58 dB | All five use originals |
| Ekotori shop | 31.55 dB | All five use originals |
| Lublin · published LOD 4 | 36.81 dB | All five use LOD |
| Lublin · published LOD 3 | 37.61 dB | All five use LOD |

Automatic quality captures jump between poses and may switch to originals. **Do not pair the higher PSNR of those original-splat captures with the faster LOD timings and call it lossless.** Fixed LOD measures the approximation. Every capture's actual path, error numerator and denominator is in the raw data.

Each bee moving trial used 16 direct and 74 LOD frames, including 32 probe frames. Each shop trial used one direct and 89 LOD frames, including one probe. Both city inputs used LOD for all 90 moving frames in each trial, with no moving probes after warmup. Automatic and fixed LOD share the same steady-state renderer; their timing differences are not a separate rasterizer optimization.

Foreground means reference RGB more than 3/255 from the background, not a true alpha matte. Five poses do not establish all-angle or temporal quality. Bee and shop retain SH3; the city inputs use SH0. The two city inputs are related published levels of the same Lublin scan, not independent scenes or the full 259M-splat original.

## Rerun variation

| Input | First v0.3 automatic mean | Rerun automatic mean | Latency change |
| --- | ---: | ---: | ---: |
| Bumblebee | 5.25 ms | 5.83 ms | +10.96% |
| Ekotori shop | 7.79 ms | 9.74 ms | +25.00% |
| Lublin · published LOD 4 | 20.03 ms | 27.42 ms | +36.87% |
| Lublin · published LOD 3 | 34.65 ms | 47.04 ms | +35.74% |

Runtime, input and harness hashes match the [first v0.3 run](../../../BENEFIT-BENCHMARKS.md). These differences are rerun variation, not a new optimization. Two trials on one device do not establish statistical significance or an every-frame speed guarantee. Older measurements remain unchanged.

After all cases completed, the device reported battery power at 25%, discharging, with no recorded thermal/performance warning. Power state was not tracked during either cohort. This limits comparison but does not establish the cause of slower absolute times. [Recorded observation](environment-after.json).

## Reproduce and inspect

Use the [v4 protocol and commands](../../BENEFIT.md). Every case has 64 warmups and 90 measured frames for each static/moving phase, a four-second interactive pass and five quality captures. The CSS viewport is 1280×720; the framebuffer is 2560×1440. Startup, loading, preprocessing and image readback are excluded from frame timing. Interactive RAF/s counts submissions, not physical presentation. All four LOD banks remain resident: this is not a streaming or memory-saving result.

- [Comparison, exact ratios and path counts](comparison.json)
- [Every case, frame, warmup and image-error measurement](results.json.gz) — gzip-compressed JSON, with no scan assets or image captures
- [Independent NumPy verification](verification.json) — the SHA-256 applies to the uncompressed JSON
- [Source inputs and creator links](../../main-scenes.json)

To regenerate this numeric archive from the verified local run:

```sh
node packages/splat-lod/benchmark/publish-benefit-rerun.mjs packages/splat-lod/benchmark/results/benefit-gate-20260906-r2
```

The recorded feature revision is `ca251512b1db572b1fc80e209d48712f70362e23`. Runtime SHA-256: `6411f9e357dd3e07b469c2d2b6231ab8d0a898391feb89451d3aee68b3a12213`. Harness SHA-256: `f9c392c729a1b7efa9a76e7d06c956ddf082f0f7dd3002dacae18db1c46292d8`. The raw reports retain the upstream bundle and source hashes too. Publishing this report does not change the released package.

Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com). Bee: [Dany Bittel](https://superspl.at/scene/cf6ac78e). Ekotori: [J](https://superspl.at/scene/8fa2ded1).
