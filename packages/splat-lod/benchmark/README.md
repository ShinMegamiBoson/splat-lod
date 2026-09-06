# Reproduce the multi-scene comparison

This is the **v0.1 historical harness**. For the rebased v0.2 library and 16M/32M inputs, use [the same-main benchmark instructions](MAIN.md). Do not compare the new library to this older npm baseline and label it a same-engine test.

This package is benchmark tooling, not a runtime dependency of the splat library. It pins PlayCanvas 2.22.0, Spark 2.1.0 / Three 0.180.0, and experimental luma.gl 9.4.0. The two `ours-*` cases import the standalone library bundle.

## Inputs and setup

Use Node 24 and Python with the library's `numpy` / `scipy` requirements. Scene assets are **not included**: verify their separate reuse rights and retain creator attribution. The tested sources, counts, SHA-256 values, camera poses, cube sizes and path amplitudes are in [scenes.mjs](scenes.mjs). For Cicada and Bee, supply the exact compressed PLY listed there. For Ekotori, supply the original SOG; preprocessing decodes it to an unfiltered Float32 SH3 PLY. Conversion does not recover information previously lost during source compression.

```sh
# From the repository root
npm ci
npm --prefix packages/splat-lod run build
python3 -m pip install -r scripts/splat-lod/requirements.txt
cd packages/splat-lod/benchmark
npm ci
```

Create a local JSON file identifying your inputs:

```json
{
  "bee": "/absolute/path/bumblebee.compressed.ply",
  "cicada": "/absolute/path/cicada-shell.compressed.ply",
  "ekotori": "/absolute/path/ekotori.sog"
}
```

```sh
PYTHON=python3 node prepare.mjs /absolute/path/sources.json
npm run build
npm run serve
```

Open `http://localhost:8016/?auto=1&run=my-comparison` in a **1280×720 CSS-pixel browser viewport**. Keep that tab visible and avoid other GPU/CPU workloads. Every renderer draws 2560×1440 physical pixels. It replaces the page between cases, without retaining a growing back/forward history of old scene documents. The run has **36 cases**: three scenes, six configurations, two reversed-order trials. Allow at least **15 GB of local disk space**, including source decoding, derived banks, and 2.7 GB of local RGBA captures, plus substantial RAM/GPU memory. Run names cannot be reused accidentally: results are written with exclusive creation.

For a short preflight only, add `&pilot=1&single=1&index=0`; pilot results cannot be exported by the summary tool. `index` resumes at an explicit case, `last` bounds a development run, and `single` prevents automatic continuation. Do not mix different protocols or runs into one result directory.

For the 7.08M shop, use **one fresh, independently closed tab per case**, indices 24–35. Open `?single=1&index=24&run=my-shop`, set the viewport before pressing Run, and close that tab after it saves; repeat in order through index 35. Repeated multi-gigabyte loads in one embedded-browser tab exhausted allocation capacity in our automated batches even with history replacement. This is a known harness/browser-lifetime limitation, not a valid timing result. The reported shop trials all use the fresh-tab procedure; do not keep the faster attempt from a failed batch. Browser viewport overrides may need to be reapplied to each new tab.

If collecting the small scenes automatically and the shop separately, `combine-runs.mjs OBJECT-RUN SHOP-RUN NEW-DESTINATION` makes a provenance-preserving local view of all 36 cases. It selects **all** object cases from the first run and **all** shop cases from the second, never by speed. Original run IDs remain in the reports; failed attempts stay in their original directories.

```sh
node summarize.mjs results/my-comparison
```

The summary includes every timing sample, per-trial metrics, source/settings metadata, capture hashes and RGB error numerators. RGBA captures remain local. Do not publish scan imagery merely because this repository's code is MIT.

## What the two timing tracks mean

1. **Completed-frame latency:** 20 warmups followed by 90 static and 90 moving frames per case. Timing starts after `requestAnimationFrame`, includes camera preparation, sorting and rendering, and ends after GPU completion. Spark waits for a matching current-camera worker sort. WebGL completion uses a signaled fence; WebGPU uses `queue.onSubmittedWorkDone()`. Fence and event-loop overhead are included, so these are not comparable GPU timestamp totals or measured FPS.
2. **Interactive RAF delivery:** four seconds along the same time-parametrized camera path, without per-frame completion fences. Spark uses its ordinary asynchronous auto-update path. Report the achieved animation callback rate and p95 intervals, not physical display presentation or a fresh-sort guarantee. Results can be capped by browser refresh rate. Spark sort lag is retained per callback.

Luma's graph skips encoding when nothing changes. Its static number is therefore **cached presentation**, not a newly rendered Gaussian frame; don't rank it as a static raster speedup. Moving poses invalidate its graph normally.

Five ordered quality poses are captured separately at 2560×1440 against same-trial full-quality PlayCanvas. RGB PSNR excludes alpha. Foreground is defined only from the reference, as any channel differing from known background by more than 3/255; it is a heuristic, not an alpha matte. Full-image error can be diluted by background, especially for object scans. Five views are not an all-angle or temporal-error certification.

## Compared configurations

| ID | Changes from its engine defaults |
| --- | --- |
| `pc-default` | Unmodified 2.22.0 unified GSplat settings and default source format/reorder; explicitly selected WebGPU, matched opaque RGBA output, no canvas MSAA, and no camera tone mapping. Default splat budget, small-contribution culling and SH update threshold are retained and logged. |
| `pc-full` | Unmodified 2.22.0 code with GPU sorting, no splat budget, no pixel/contribution culling, SH update angle 0, preserved source order, and decompressed GPU parameters. This is the image reference, **not the default configuration**. |
| `ours-source` | Released four-bank standalone path with LOD off; originals only, global GPU sort, all SH3, same full-quality settings. All four banks remain resident. |
| `ours-lod` | Same library at its default 2× sooner LOD setting; fixed cube sizes and 1/2, 1/4, 1/8 replacement banks. This is lossy. |
| `spark` | Full source, SH3, LOD off, directional sorting, no minimum-size culling, alpha cutoff 1/255, focal adjustment 2 and covariance blur 0.3 to match the PlayCanvas projection convention. Native PackedSplats adds parameter quantization. Not a Spark LOD benchmark. |
| `luma` | Experimental `GPUPagedSplatRenderer`, native Float32 parameters, SH3, globally sorted GPU pages, no size culling, alpha cutoff 1/255, covariance kernel 0.3, tone mapping off. A different 16-bit depth-key/projection/blending implementation, not pixel-identical PlayCanvas. |

All camera clipping planes are 0.1–1000 scene units. Cicada/Shop cameras and up vectors are rotated into untransformed source coordinates, preserving the public viewer's orientation without rotating or refitting SH. Bee uses its original source-space camera. Camera/path fixes were completed during preflight before the reported runs; no renderer-specific camera or LOD tuning is performed.

Other surveyed implementations were not silently ranked with reduced features: [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) is no longer maintained and supports SH only through degree 2; [gsplat.js](https://github.com/huggingface/gsplat.js) uses the SH-free `.splat` representation. This is a bounded comparison of three renderer families, not every implementation that exists.

## Limitations

One computer, one browser backend, short prescribed paths, and only two trials. No confidence interval, universal ranking, equal-memory claim, mobile/WebGL fallback test, streaming/load-time benchmark, or all-angle quality claim. Capture hashes make retained images identifiable but cannot make unredistributed scans independently available. Test your workload; do not extrapolate a win on one scene to all scenes.
