# Test the automatic speed selector

This is the v0.3 follow-up to [the fixed-LOD v0.2 comparison](MAIN.md). It tests whether the renderer uses the direct path when LOD has no measured advantage. It is not a comparison that switches to lower-quality PC defaults.

[benefit-protocol.mjs](benefit-protocol.mjs) fixes the protocol before timing. The four inputs, cameras, clipping, cube sizes and source hashes remain in [main-scenes.json](main-scenes.json): Bee and shop with SH3, plus the 16.18M and 32.37M published SH0 levels of the same Lublin scan. No new preprocessing or source filtering is performed.

## Controls

All four configurations use the same PlayCanvas main base, framebuffer, full SH terms, zero size/contribution cutoffs and current-view global GPU sorting:

| ID | Path |
| --- | --- |
| pc-full | Unmodified upstream full-quality control |
| ours-direct | Original splats, direct source-bank projection; no cube selection or prefix scan |
| ours-fixed | Fixed 2× screen-size LOD, speed selector disabled |
| ours-auto | Default measured choice between those two equivalent-setting paths |

LOD remains an approximation. Falling back to source does not add approximation, but keeping LOD does not make it lossless.

## Run

Prepare the four inputs using [MAIN.md](MAIN.md), then from the repository root:

```sh
node packages/splat-lod/benchmark/build-main.mjs
node packages/splat-lod/benchmark/server.mjs --benefit
```

Use a fresh, visible browser tab for each case, with a 1280×720 CSS viewport. The harness explicitly renders a 2560×1440 framebuffer independent of browser DPR. Open localhost:8016 with ?single=1&run=YOUR-UNIQUE-RUN&index=0, press Run comparison, wait for “Completed and saved locally,” then close it. Repeat through index 31. Do not mix source builds or run other GPU/CPU-heavy work during the batch.

Each input runs four configurations, then repeats them in reverse order. Each case has 64 warmups and 90 measured frames for each of the static and moving phases, a four-second interactive pass and five quality captures. All warmup timings and every direct/LOD/probing state are retained, separately from the measured sample set.

The complete batch has 5,760 measured completed frames, 4,096 warmup frames, 32 interactive passes and 160 full-resolution quality captures. Moving measurements include any rechecks triggered during the path. Do not discard probe frames or rank only the adaptive frames that chose the winner.

```sh
cd packages/splat-lod/benchmark
node summarize.mjs results/YOUR-UNIQUE-RUN --benefit
python3 verify_results.py results/YOUR-UNIQUE-RUN
```

The checked-in publication uses the frozen run `benefit-gate-20260906-r1`. Its exporter also accepts the two saved live fallback-control proofs (no reduction, then marginal gain):

```sh
node publish-benefit-report.mjs results/benefit-gate-20260906-r1 /path/to/no-reduction-proof.json /path/to/marginal-proof.json
```

For that control, use the generated torus with `lodMultiplier: 0.001`, wait for a measured decision, and click **Check renderer**. Then change to multiplier 2 and save another check. Timings vary; do not discard decisions that differ from the recorded example or assert that this scene always favors one path. The public [fallback-controls.json](measurements/2026-09-06-benefit/fallback-controls.json) retains the two actual observations from this run.

As before, completed-frame latency includes preparation, submission and a GPU completion fence. The runtime speed selector itself inserts no fence: it uses native asynchronous timestamps and CPU submission time. Those measurements estimate cost; they cannot guarantee that the selected path wins on every future frame. Report mean, median and p95 together, and retain the probe fraction and per-trial results.

Quality is compared against the same-trial pc-full image at five ordered poses. Foreground uses the reference-only background threshold, not a true alpha matte. No all-angle or temporal-quality certification is implied.

## Direct-path invariant

The standalone example's Check renderer action verifies original/automatic/reduced-only selections near and far. Its additional moving-source check must report eight source dispatches, zero cube-selection passes and zero prefix scans for eight frames. It temporarily disables speed adaptation while auditing geometry and chunk-color round trips, then restores the caller's setting.

The pure policy tests cover losing LOD, small/noisy gains, tail regressions, CPU bottlenecks, obsolete/invalid timestamps, unsupported timing, timeouts, hysteresis and cleanup. Real scene timing—not injected test values—is required before claiming a performance result.

Scene assets and captures stay local. Lublin: 3D scanning data created and provided by [Andrii Shramko](https://www.linkedin.com/in/andrii-shramko/), [Teleportour](https://www.linkedin.com/company/teleportour/) · [teleportour.com](https://teleportour.com).
