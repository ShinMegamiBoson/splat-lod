# Retained bee benchmark

Recorded September 5, 2026. Scene: [DanyBittel's bumblebee](https://superspl.at/scene/cf6ac78e), 2,315,943 original SH3 Gaussians. Source SHA-256: `265a31cf8ed2c513d318668a6883bb5eab35cbadbce9eac5e2637246effa8fdd`. No scene files or rendered images are redistributed here.

Device: Apple M5 Max, 128 GB, Metal 3. Viewport: **2560 × 1440**, DPR 2. All original-source comparisons retained degree-3 SH, matched camera path/FOV, and matched native-resolution output. LOD intentionally changes geometry and appearance.

Two counterbalanced fresh-page trials, each with 60 static and 60 moving samples per renderer after warmup: **120 samples per phase per renderer**, 1,440 timed frames in total.

| Renderer | Static median | Moving median | Moving p95 |
| --- | ---: | ---: | ---: |
| Stock PlayCanvas 2.21.4 | 9.65 ms | 9.75 ms | 19.8 ms |
| Our four-bank renderer, LOD off | 10.90 ms | 10.65 ms | 12.6 ms |
| **Our renderer, 2× sooner LOD** | **6.10 ms** | **6.50 ms** | **8.3 ms** |
| Stock PlayCanvas 2.22.0 | 8.80 ms | 9.30 ms | 16.7 ms |
| Stock 2.22.0, compressed GPU format | 11.10 ms | 11.40 ms | 16.5 ms |
| Spark 2.1.0, strictly current-camera sorting | 13.10 ms | 36.95 ms | 107.7 ms |

The LOD row's pooled moving median is **1.43× faster** than stock 2.22.0, with a quality tradeoff. It selected approximately **1.158M down to 1.049M** Gaussians along the path. This is not evidence that the four-bank, LOD-disabled renderer is faster than stock; it was slower.

## Measurement boundary

These are **current-view completed-frame latencies, not uncapped interactive FPS**. Each sample waits for preparation/sorting for the requested camera and GPU completion. Completion-fence overhead is included. Pixel readbacks occur separately, outside timing. Spark's normal asynchronous display can reuse a stale sort; that was intentionally not counted as a freshly sorted moving frame, so the Spark row should not be interpreted as its usual interactive frame rate.

GPU timing scopes were not identical between engines. PlayCanvas timestamps covered all native passes. Spark's GPU column covered draw only, with generation/readback/worker sorting charged to preparation and completed-frame latency. Do not compare those raw GPU columns as equivalent pipeline totals.

There was substantial run-to-run timing drift. These are two trials on one device/scene and a short camera path, not a universal ranking, thermal study, statistical significance claim or full all-angle evaluation.

## Image error

Three fixed positions along the path were compared against stock PlayCanvas 2.21.4, using lossless native-resolution RGB outputs.

| Configuration | Minimum full-image PSNR | Minimum foreground PSNR |
| --- | ---: | ---: |
| Our renderer, LOD off | 77.72 dB | 66.76 dB |
| **Our renderer, 2× sooner LOD** | **39.53 dB** | **28.73 dB** |
| Stock PlayCanvas 2.22.0 | 84.74 dB | — |
| Spark 2.1.0 | 44.01 dB | 33.06 dB |

The foreground mask is a heuristic: a reference pixel differs from background RGB 18 by more than 3 in any channel. It is **not** a true alpha silhouette. The dark background inflates full-image PSNR; the foreground result matters. **LOD is visibly approximate and is not qualified as negligible error.**

## Reproducing the library's extraction checks

Build the synthetic example, run the example server, and choose **Compare detail and verify → Check renderer**. The checks compare actual GPU IDs against a CPU oracle at near/far cameras and verify that chunk-color mode restores normal appearance. Local JSON proofs are saved under the ignored `packages/splat-lod/.proof/` directory.

For your own scan, prepare its banks, serve its manifest, and supply a local configuration through `SPLAT_LOD_DEMO_CONFIG`. `SPLAT_LOD_ASSETS_ROOT` optionally mounts an existing asset directory read-only at `/assets/`. An optional `regression` section accepts a fixed width/height and ordered cases containing mode, camera and reference-PNG paths. Capture the baseline at the exact same camera, viewport, background, SH degree and LOD history; do not compare unrelated framing or stale sorting.

The standalone extraction was checked against six bee frames and rebuilt its LOD assets byte-for-byte. Those parity checks do **not** replace a fresh performance benchmark on your scene and hardware.
