# Reproduce the current-main comparison

Use this for v0.2. The old [v0.1 harness](README.md) stays available separately.

Both stock controls and the library are built from upstream main at d753e98c70d67b755754c614f383d215cacbbd63 (2.23.0-beta.2). The executed feature commit is 371cddb4226e49aab757f18cd0625690a485fe68. [main-protocol.mjs](main-protocol.mjs) freezes the settings and [main-scenes.json](main-scenes.json) freezes counts, hashes, cameras, clipping, paths and cube sizes. Later documentation changes do not alter the tested runtime.

## Build and prepare

Use Node 24, Python with NumPy/SciPy, WebGPU and enough RAM for all four banks. The test machine has 128 GiB. Allow roughly 60 GB of disk space for inputs, derived banks and captures. This is not an out-of-core streaming test.

```sh
# From the repo root
npm ci --ignore-scripts
npm --prefix packages/splat-lod/benchmark ci --ignore-scripts
python3 -m pip install -r scripts/splat-lod/requirements.txt
node packages/splat-lod/benchmark/build-main.mjs
```

The last command builds unmodified upstream engine code, the standalone library and the main-only harness. The embedded engine revision comes from the shared ENGINE_BASE constant. The main-only harness aliases its PC import to this local engine build, not npm PlayCanvas 2.22.0.

Supply the exact Bee compressed PLY and Ekotori Float32 SH3 PLY in main-scenes.json. Build their banks with build_lod.py, using cube edges 0.03 and 0.5 respectively. The loader verifies source and bank hashes. Use new output directories; do not overwrite an existing build.

For the city inputs, the pinned splat-transform 3.3.3 downloads the entire published levels:

```sh
cd packages/splat-lod/benchmark
mkdir -p assets/lublin-main
NODE_OPTIONS=--max-old-space-size=32768 ./node_modules/.bin/splat-transform \
  https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json \
  --select-lod 4 assets/lublin-main/lublin-16m.ply
NODE_OPTIONS=--max-old-space-size=32768 ./node_modules/.bin/splat-transform \
  https://code.playcanvas.com/examples_data/downtown_02/lod-meta.json \
  --select-lod 3 assets/lublin-main/lublin-32m.ply
python3 ../../../scripts/splat-lod/build_lod.py \
  assets/lublin-main/lublin-16m.ply assets/lublin-main/lublin-16m-lod --cell-size 16
python3 ../../../scripts/splat-lod/build_lod.py \
  assets/lublin-main/lublin-32m.ply assets/lublin-main/lublin-32m-lod --cell-size 16
```

These contain 16,184,440 and 32,368,879 SH0 splats. They are complete published levels of the same scan, not the full 258,951,032-splat source. Conversion cannot recover detail already lost in the published levels. No extra point filtering or invented SH terms are used.

Create an ignored config.local.json in this benchmark directory containing the two prepared input mounts:

```json
{
  "mounts": {
    "bee": "/absolute/path/to/prepared-bee",
    "ekotori": "/absolute/path/to/prepared-shop"
  }
}
```

```sh
node prepare-main-config.mjs --freeze-scenes
npm run serve:main
```

Preparation adds the two city mounts and verifies the frozen scene list. Assets and local paths are not committed. Retain the source creators' attribution and terms; this repository's MIT license does not license the scans.

## Run

Open localhost:8016 with ?single=1&run=YOUR-UNIQUE-RUN&index=0. Set a **1280×720 CSS viewport before pressing Run comparison**, keep the tab visible, and wait for “Completed and saved locally.” Close that tab; open a fresh tab for the next index. Repeat through index 55. The controlled browser viewport reported DPR 1; the harness independently fixes every framebuffer at **2560×1440**, a 2× backing resolution. It does not lower resolution to fit the browser DPR.

One fresh, independently closed tab per case avoids retained large GPU allocations between loads. A UI-read timeout is not a renderer failure: leave the active case running and check its saved status. Do not close it in timeout cleanup or select whichever attempt was faster. Run names cannot overwrite existing reports. If a setup repair requires rerunning an input, retain the failed attempt and rerun all its modes in order.

Indices 0–13 are Bee, 14–27 shop, 28–41 Lublin 16M and 42–55 Lublin 32M. Each input runs seven modes, then reverses their order for trial two. Each case has 20 warmups followed by 90 static and 90 moving frames, a separate four-second interactive pass and five full-resolution quality images. Use &pilot=1 only for untimed setup checks; pilot reports cannot be published.

Do not run downloads, preprocessing, builds or other graphics workloads during timing. The reported batch used the same fixed settings and paths throughout.

```sh
node summarize.mjs results/YOUR-UNIQUE-RUN --main
python3 verify_results.py results/YOUR-UNIQUE-RUN
```

The second implementation recomputes all pixel SSE/PSNR values and all timing rows with NumPy. Captures remain local. The date-specific publish-main-report.mjs also checks the independent summary hash, protocol, complete cohort and pinned run before exporting numeric evidence. It intentionally refuses a different run; do not replace the published record with a faster rerun.

## Settings

All modes render static source geometry with current-view global GPU sorting, matched cameras and no tone mapping.

| Mode | LOD | Pixel / contribution cutoff | SH update |
| --- | --- | --- | --- |
| pc-full | Off | 0 / 0 | Every view; decompressed, unreordered source |
| ours-lod | 2× sooner | 0 / 0 | Visible splats every view |
| ours-contribution | 2× sooner | 0 / 3 | Visible splats every view |
| ours-defaults | 2× sooner | 2 / 3 | Visible splats every view |
| ours-cached | 2× sooner | 2 / 3 | Native PC cache, 10° |
| pc-default | Off | Stock: 2 / 3 | Stock: 10°; native format/reorder |
| ours-source | Off | 0 / 0 | Visible splats every view; all four banks resident |

An optimization could become the default only with at least 5% lower moving median, at most 0.5 dB lost minimum foreground PSNR and at most 20% higher moving p95 versus ours-lod on **every** input. No candidate passed. The default remains exact/visible; the alternatives are opt-in.

See [the report](../MAIN-BENCHMARKS.md) for timing definitions, every mode, per-trial variation and limits. The 120 Hz interactive ceiling, short paths, related city inputs, extra resident memory and lossy LOD all matter when interpreting a win.

Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com). [Dataset terms](https://drive.google.com/uc?export=download&id=1QIhzn0LUWgOZUBzX5ethVEPgog6bUaSb).
