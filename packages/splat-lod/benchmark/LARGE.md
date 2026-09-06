# Large-scene comparison

The protocol and three inputs are fixed before timing. This is a new v0.3 cohort, not a rescore of older measurements.

## Inputs

- [Rocca di Montecatini Alto](https://superspl.at/scene/abdf12c6), enryt: all 7,049,716 published LOD-0 splats, SH3.
- [Wat Paknam Bhasicaroen](https://superspl.at/scene/905ec260), ethan3111: all 8,845,461 published splats, SH0.
- [LCC2Rock](https://superspl.at/scene/157bad1d), kumar3ar: all 12,219,582 published LOD-0 splats plus the separate 26,349-splat environment, SH0.

All three are downloadable under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The full published level is the input—not the sum of all levels, a crop, or a replicated scene. Published SOG values are decoded to float PLY, without additional filtering or harmonic removal. SH0 stays SH0. Assets, derived banks and image captures are not redistributed in this repo.

Cube edge length is the longest axis of the central 98% position extent divided by 32, with the same rule for every scene. All splats, including outliers, are assigned to cubes. This only determines cube size; it does not filter the input. The camera starts at the published viewer pose, transformed into source coordinates. The fixed smooth path translates sideways/backward and changes aim; its translation amplitude is one cube edge. No camera, chunk size or renderer setting is tuned against the measured result.

## Measurement

`large-protocol.mjs` extends the existing benefit-gated benchmark. Three scenes × six configurations × two trials = 36 cases. Trial two reverses configuration order. Each case runs in a fresh visible browser tab:

- 2560×1440 physical pixels; 1280×720 CSS viewport.
- 64 retained warmup frames, then 90 measured frames, for both static and moving paths: 6,480 timed frames and 4,608 warmups total.
- A separate four-second interactive animation-frame pass.
- Five separate full-resolution image captures. Readback is outside timing.

Configurations: Splat LOD v0.3 automatic, full-quality PlayCanvas on the same engine base, stock-default PlayCanvas, Spark 2.1.0, luma.gl 9.4.0, and a fixed-LOD control. The pinned engine is [d753e98](https://github.com/playcanvas/engine/commit/d753e98c70d67b755754c614f383d215cacbbd63), 2.23.0-beta.2. All use the same camera, source parameters, available SH, background and output resolution. Stock defaults retain their native approximations. Other implementations differ in packing, projection and sorting; image error is reported, not assumed to be zero.

Rank the **pooled moving completed-frame median**, which includes current-view preparation/sort, submission and a GPU completion fence. This is not FPS. Spark's worker sort is awaited here; its normal asynchronous interactive delivery is reported separately. luma.gl can reuse its static presentation, so static timing does not determine the winner.

The fastest eligible renderer is bold. Speedup over next-best is second-smallest median divided by smallest, calculated before rounding. Exact ties remain ties; margins within 5% are labeled near-ties, not statistically significant wins. A failed or incomplete configuration stays visible but unranked. Fixed LOD is a diagnostic, not a second entry for the same product in the primary ranking.

Quality is RGB PSNR versus the same-trial full-quality PlayCanvas render. Foreground uses the reference's RGB difference from background (>3/255), not an alpha segmentation. Report the worst of five poses and two trials. The automatic renderer may switch to original splats for these abrupt quality-camera jumps; record that path and report fixed-LOD quality separately. Do not attach its near-perfect original-splat capture quality to reduced timing frames. These few poses do not establish temporal or all-angle fidelity.

## Reproduce

```sh
npm ci --ignore-scripts
npm --prefix packages/splat-lod/benchmark ci --ignore-scripts
python3 -m venv .venv
.venv/bin/pip install -r scripts/splat-lod/requirements.txt
node packages/splat-lod/benchmark/build-main.mjs
PYTHON="$(pwd)/.venv/bin/python" node packages/splat-lod/benchmark/prepare-large.mjs
node packages/splat-lod/benchmark/server.mjs --large
```

Use an absolute `PYTHON` executable if it is outside `PATH` (the preparation script runs child processes from the benchmark directory). The generated `config-large.local.json` holds local mounts and is ignored. Source hashes and camera poses are saved in `large-scenes.json`.

Open `http://localhost:8016/?single=1&run=large-comparison&index=0` with the specified viewport and click **Run comparison**. Wait for **Report saved**, close that tab, and repeat indices 1–35 in fresh tabs with the same run name. Keep the measured tab visible and avoid simultaneous GPU workloads. `pilot=1` is for setup checks only and is rejected by the report publisher. Never rerun a case in-place or discard slow results.

```sh
node packages/splat-lod/benchmark/summarize.mjs packages/splat-lod/benchmark/results/large-comparison --large
.venv/bin/python packages/splat-lod/benchmark/verify_results.py packages/splat-lod/benchmark/results/large-comparison
```

The independent Python verifier recomputes pixel errors from raw captures and all frame statistics. Publish every case, failures included, with pinned source, library, harness, upstream and dependency hashes. Only numeric evidence, source credits, software versions and benchmark hardware specs belong in the public report.
