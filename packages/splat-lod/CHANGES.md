# Changes from PlayCanvas

## v0.3.0

- Automatic detail now compares equivalent direct and LOD paths, preferring originals unless LOD has a measured advantage. The raster filters, SH settings and framebuffer size do not change during selection.
- Added a real source bypass: one bank dispatch, no cube selection or prefix scan, and direct world-ID addressing without a per-splat range search.
- Bounded asynchronous timestamp probes, separate entry/exit margins, motion rechecks and conservative fallback when timing is unavailable. No GPU completion wait or extra duplicate draw in the normal frame loop.
- Added `adaptiveLod`, `setAdaptiveLod()`, and path/dispatch diagnostics. Explicit display/debug modes remain available; all four asset banks still remain resident.
- The old v0.1/v0.2 reports below remain historical fixed-LOD measurements.

## v0.2.0

- Rebased the five fork commits onto upstream main [d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63), version 2.23.0-beta.2. No upstream renderer code is replaced by the cube-LOD module.
- Added explicit profiles for PC's contribution and footprint culling, plus the choice between fused visible SH and PC's cached work-buffer SH.
- Added native SH0 preprocessing and rendering for the large city inputs. Missing directional coefficients are not synthesized, and SH3 inputs keep all 45 higher-order coefficients.
- Added a same-upstream-base comparison and larger-input tests, separate from the v0.1 measurements below.
- Tested Bee (2.32M, SH3), shop (7.08M, SH3), and complete published Lublin levels containing 16.18M and 32.37M SH0 splats. All 56 cases passed; 10,080 timed frames and 280 image comparisons were independently checked. [Results](MAIN-BENCHMARKS.md).
- Kept exact/visible as the default. Contribution culling helps some inputs, but the extra quality loss on Bee and the 32M city input fails the preset guard. Cached SH did not give a consistent win. The alternatives remain explicit options.
- The installed v0.2 bundle is byte-identical to the timed runtime. Six near/far synthetic SH0 selection audits passed with zero mismatches. [Package checks](VALIDATION-v0.2.json). The v0.1 extraction validation below is retained as historical evidence.

## v0.1.0 extraction

Base: [`e287e0c67f3c20c689a52b7c53d2b7fedbe887da`](https://github.com/playcanvas/engine/commit/e287e0c67f3c20c689a52b7c53d2b7fedbe887da), tag `v2.21.4`.

### Added

- A standalone ESM bundle and typed API: load, camera updates, native-resolution resize, LOD multiplier, original/reduced-only modes, chunk coloring, explicit diagnostics, start/stop and disposal.
- `src/framework/splat-lod/`: cube selection, permanent source indexing, bank-major range prefixes, indirect range projection, fused visible-only SH3 evaluation, and instance-local integration with the native GPU-sort renderer.
- `scripts/splat-lod/`: generic PLY decoder and cube-bank builder. Fixed world cubes, deterministic cube-local KD groups, 2/4/8-to-one moment merging, all SH3 terms, exhaustive ownership, binary tables and SHA-256 manifests.
- A shared policy JSON used by preprocessing and validation, plus strict camera/viewport/manifest guards.
- An original synthetic example with camera controls, diagnostic chunk coloring, and GPU-versus-CPU selected-ID audits.
- Unit tests, preprocessing tests, TypeScript consumer checks, package build/CI and documented browser regression results.

### Runtime changes

| Stock pipeline stage | Fork's cube-LOD path |
| --- | --- |
| Expand resident placement intervals | Choose a visible cube's original or reduced range on the GPU |
| Materialize selected IDs | Bank-major prefixes and a permanent source-order lookup in projection |
| Refresh SH color for resident data on camera movement | Evaluate SH during visible projection, matching native work-buffer quantization |
| Project every selected original | Project only the selected cube representation |
| Sort and rasterize | Retained native **global** GPU depth sort and Gaussian draw |

The extraction is additive. Existing upstream engine sources outside the new module, engine exports, and upstream examples remain available. The root README points to the library; the original is retained as `README.upstream.md`. The lint configuration recognizes JSON import attributes for the new module only.

The library's per-view path does not upload camera-indexed splat lists, read full-resolution images, render impostors, cache MPI meshes, use temporal/stochastic approximations, or alter the canvas resolution for speed. Validation readbacks are explicit opt-in methods.

### What was intentionally not included

- Prior MPI, spherical-shell, radiance-meshlet, impostor, temporal and view-cell experiments.
- Scene-specific cameras, absolute project paths, benchmark servers, cloud credentials or model-generation scripts.
- The bee, store, city scans or their derived LOD banks. The example is generated from mathematical geometry.
- Claims of universally optimal LOD, lossless merging, 2× FPS, or a win with LOD disabled.

### Validation of this extraction

- Rebuilding all 2,315,943 bee source splats with the standalone preprocessor produced **byte-identical** replacement PLY banks and all eight metadata files compared with the benchmarked implementation: 249 cubes, 1,158,035 / 579,071 / 289,599 replacement records.
- Real WebGPU browser checks passed for both the synthetic scene and the bee: original, automatic and eligible-reduced-only views at near and far poses; zero GPU/CPU decision or selected-ID mismatches.
- Six saved-frame comparisons at 2560×1440, using the **installed tarball** and newly preprocessed banks, matched the original renderer very closely: source-mode PSNR **85.72–87.69 dB**, LOD-mode **88.56–89.76 dB**. These are **extraction parity**, not LOD-versus-ground-truth quality. Small pixel differences remain; this is not a bit-exact-render claim. Numeric results: [VALIDATION.json](VALIDATION.json).
- Chunk-color round trips restored natural appearance. They do not change geometry, opacity, bank ownership or the SH coefficients stored on disk.

See [BENCHMARKS.md](BENCHMARKS.md) for the fresh three-scene, multi-renderer comparison of the standalone runtime bundle, including stock defaults, a full-quality control, moving-camera timing, image error, and its limits. The benchmark harness is separate development tooling; it is not a runtime dependency.
