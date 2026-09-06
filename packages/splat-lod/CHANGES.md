# Changes from PlayCanvas 2.21.4

Base: [`e287e0c67f3c20c689a52b7c53d2b7fedbe887da`](https://github.com/playcanvas/engine/commit/e287e0c67f3c20c689a52b7c53d2b7fedbe887da), tag `v2.21.4`.

## Added

- A standalone ESM bundle and typed API: load, camera updates, native-resolution resize, LOD multiplier, original/reduced-only modes, chunk coloring, explicit diagnostics, start/stop and disposal.
- `src/framework/splat-lod/`: cube selection, permanent source indexing, bank-major range prefixes, indirect range projection, fused visible-only SH3 evaluation, and instance-local integration with the native GPU-sort renderer.
- `scripts/splat-lod/`: generic PLY decoder and cube-bank builder. Fixed world cubes, deterministic cube-local KD groups, 2/4/8-to-one moment merging, all SH3 terms, exhaustive ownership, binary tables and SHA-256 manifests.
- A shared policy JSON used by preprocessing and validation, plus strict camera/viewport/manifest guards.
- An original synthetic example with camera controls, diagnostic chunk coloring, and GPU-versus-CPU selected-ID audits.
- Unit tests, preprocessing tests, TypeScript consumer checks, package build/CI and documented browser regression results.

## Runtime changes

| Stock pipeline stage | Fork's cube-LOD path |
| --- | --- |
| Expand resident placement intervals | Choose a visible cube's original or reduced range on the GPU |
| Materialize selected IDs | Bank-major prefixes and a permanent source-order lookup in projection |
| Refresh SH color for resident data on camera movement | Evaluate SH during visible projection, matching native work-buffer quantization |
| Project every selected original | Project only the selected cube representation |
| Sort and rasterize | Retained native **global** GPU depth sort and Gaussian draw |

The extraction is additive. Existing upstream engine sources outside the new module, engine exports, and upstream examples remain available. The root README points to the library; the original is retained as `README.upstream.md`. The lint configuration recognizes JSON import attributes for the new module only.

The library's per-view path does not upload camera-indexed splat lists, read full-resolution images, render impostors, cache MPI meshes, use temporal/stochastic approximations, or alter the canvas resolution for speed. Validation readbacks are explicit opt-in methods.

## What was intentionally not included

- Prior MPI, spherical-shell, radiance-meshlet, impostor, temporal and view-cell experiments.
- Scene-specific cameras, absolute project paths, benchmark servers, cloud credentials or model-generation scripts.
- The bee, store, city scans or their derived LOD banks. The example is generated from mathematical geometry.
- Claims of universally optimal LOD, lossless merging, 2× FPS, or a win with LOD disabled.

## Validation of this extraction

- Rebuilding all 2,315,943 bee source splats with the standalone preprocessor produced **byte-identical** replacement PLY banks and all eight metadata files compared with the benchmarked implementation: 249 cubes, 1,158,035 / 579,071 / 289,599 replacement records.
- Real WebGPU browser checks passed for both the synthetic scene and the bee: original, automatic and eligible-reduced-only views at near and far poses; zero GPU/CPU decision or selected-ID mismatches.
- Six saved-frame comparisons at 2560×1440, using the **installed tarball** and newly preprocessed banks, matched the original renderer very closely: source-mode PSNR **85.72–87.69 dB**, LOD-mode **88.56–89.76 dB**. These are **extraction parity**, not LOD-versus-ground-truth quality. Small pixel differences remain; this is not a bit-exact-render claim. Numeric results: [VALIDATION.json](VALIDATION.json).
- Chunk-color round trips restored natural appearance. They do not change geometry, opacity, bank ownership or the SH coefficients stored on disk.

See [BENCHMARKS.md](BENCHMARKS.md) for the earlier speed/quality experiment and its limits. The performance table is retained evidence from the renderer before packaging, not a newly run multi-renderer benchmark of this release.
