# Large-scene benchmark results

## Large-scene benchmarks

September 6, 2026 · Splat LOD v0.3 · Apple M5 Max, 128 GB · **2560×1440**. Three new, distinct scenes; full published resolution, including LCC2Rock's environment. Rocca has SH3; the other two are natively SH0.

**Moving-camera median frame time; lower is better.** Bold is the fastest measured configuration. “Over next-best” is its speedup over second place—not necessarily our speedup. PC = PlayCanvas. Margins within 5% are near-ties, not established wins.

| Scene / input splats | Fastest | Over next-best | Splat LOD v0.3 | PC defaults | PC full quality | Spark 2.1 | luma.gl 9.4 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rocca di Montecatini Alto · 7.05M | PC defaults | 1.70× | 9.89 ms | **5.83 ms** | 10.13 ms | 100.70 ms | 22.34 ms |
| Wat Paknam Bhasicaroen · 8.85M | PC full quality | 1.02× (near-tie) | 18.28 ms | 14.32 ms | **14.02 ms** | 120.68 ms | 27.18 ms |
| LCC2Rock · 12.25M | Splat LOD v0.3 | 1.22× | **9.10 ms** | 11.09 ms | 12.35 ms | 148.81 ms | 27.61 ms |

Automatic mode used **original splats for all 540 measured moving frames**. These timings measure its optimized direct fallback, not an LOD speedup.

PlayCanvas is 2.23.0-beta.2 on the same engine base as this library. Two reversed-order trials; 36/36 cases completed. Timings include current-view sorting and a GPU completion fence, so they are **not interactive FPS**. Spark waits for its worker sort here; its normal asynchronous loop is reported separately. luma.gl is experimental. Different default approximations mean this is not a quality-matched race.

### Quality

Worst foreground RGB PSNR across five poses and both trials versus full-quality PlayCanvas; higher is better. ∞ means zero measured error, not a general equivalence guarantee. These are separate image captures, not measurements of every timed frame.

| Scene | Splat LOD v0.3 | PC defaults | PC full quality | Spark 2.1 | luma.gl 9.4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rocca di Montecatini Alto | 60.94 dB | 21.64 dB | ∞ | 27.14 dB | 23.06 dB |
| Wat Paknam Bhasicaroen | 62.16 dB | 30.90 dB | ∞ | 32.78 dB | 23.74 dB |
| LCC2Rock | 30.18 dB | 29.94 dB | ∞ | 31.24 dB | 25.97 dB |

**Quality captures can use a different path from the timing frames.** Rocca di Montecatini Alto: 10 original / 0 LOD; Wat Paknam Bhasicaroen: 10 original / 0 LOD; LCC2Rock: 6 original / 4 LOD. The fixed-LOD control below keeps reduction enabled for both timing and captures:

| Scene | Fixed LOD moving median / p95 | Fixed LOD minimum foreground PSNR |
| --- | ---: | ---: |
| Rocca di Montecatini Alto | 11.73 / 12.83 ms | 27.84 dB |
| Wat Paknam Bhasicaroen | 17.73 / 22.79 ms | 39.30 dB |
| LCC2Rock | 9.33 / 14.74 ms | 29.89 dB |

LOD trades quality for speed. The 2× setting changes transition distances, not FPS. These short paths on one device do not establish a universal fastest renderer or all-angle quality.

[All frame times, actual LOD paths and source credits](../../../benchmark/measurements/2026-09-06-large/README.md) · [Reproduce](../../../benchmark/LARGE.md) · [Numeric results](../../../benchmark/measurements/2026-09-06-large/summary.json)

## Complete timing table

| Scene | Renderer | Moving mean / median / p95 ms | Static median ms | Interactive RAF/s, trials 1 / 2 |
| --- | --- | ---: | ---: | ---: |
| Rocca di Montecatini Alto | PC full quality | 10.24 / 10.13 / 11.32 | 7.78 | 105.53 / 76.59 |
| Rocca di Montecatini Alto | Splat LOD v0.3 | 9.79 / 9.89 / 12.64 | 7.88 | 119.98 / 94.86 |
| Rocca di Montecatini Alto | PC defaults | 6.05 / 5.83 / 7.65 | 6.40 | 120.25 / 119.97 |
| Rocca di Montecatini Alto | Spark 2.1 | 101.02 / 100.70 / 107.35 | 14.47 | 70.16 / 80.42 |
| Rocca di Montecatini Alto | luma.gl 9.4 | 22.64 / 22.34 / 28.59 | 0.35 | 45.11 / 51.93 |
| Rocca di Montecatini Alto | Splat LOD fixed 2× | 11.86 / 11.73 / 12.83 | 9.59 | 88.82 / 89.07 |
| Wat Paknam Bhasicaroen | PC full quality | 13.90 / 14.02 / 17.58 | 14.39 | 66.86 / 56.72 |
| Wat Paknam Bhasicaroen | Splat LOD v0.3 | 18.07 / 18.28 / 21.77 | 17.04 | 54.91 / 55.45 |
| Wat Paknam Bhasicaroen | PC defaults | 14.26 / 14.32 / 16.95 | 13.25 | 65.88 / 66.57 |
| Wat Paknam Bhasicaroen | Spark 2.1 | 120.21 / 120.68 / 127.59 | 19.03 | 56.57 / 38.80 |
| Wat Paknam Bhasicaroen | luma.gl 9.4 | 28.59 / 27.18 / 36.27 | 0.24 | 29.68 / 31.38 |
| Wat Paknam Bhasicaroen | Splat LOD fixed 2× | 17.44 / 17.73 / 22.79 | 16.51 | 46.75 / 51.65 |
| LCC2Rock | PC full quality | 12.33 / 12.35 / 20.14 | 7.75 | 82.87 / 77.91 |
| LCC2Rock | Splat LOD v0.3 | 9.84 / 9.10 / 16.86 | 6.61 | 94.31 / 83.31 |
| LCC2Rock | PC defaults | 11.10 / 11.09 / 14.02 | 8.26 | 103.29 / 99.54 |
| LCC2Rock | Spark 2.1 | 149.16 / 148.81 / 161.69 | 14.24 | 53.42 / 73.38 |
| LCC2Rock | luma.gl 9.4 | 28.13 / 27.61 / 39.11 | 0.25 | 44.93 / 38.83 |
| LCC2Rock | Splat LOD fixed 2× | 9.27 / 9.33 / 14.74 | 6.50 | 99.92 / 97.05 |

Interactive RAF/s counts animation-frame submissions, not confirmed physical presentation. Spark can use a stale asynchronous sort in that track. Completed-frame timing waits for current-view sorting. Neither metric alone is a universal renderer ranking.

## Automatic LOD paths

| Scene / trial | LOD timing frames | Direct timing frames | Probe frames (included) | Capture paths |
| --- | ---: | ---: | ---: | --- |
| rocca / 1 | 0/90 | 90/90 | 1 | direct, direct, direct, direct, direct |
| rocca / 2 | 0/90 | 90/90 | 1 | direct, direct, direct, direct, direct |
| wat-paknam / 1 | 0/90 | 90/90 | 0 | direct, direct, direct, direct, direct |
| wat-paknam / 2 | 0/90 | 90/90 | 0 | direct, direct, direct, direct, direct |
| lcc2rock / 1 | 0/90 | 90/90 | 0 | direct, direct, direct, direct, direct |
| lcc2rock / 2 | 0/90 | 90/90 | 0 | lod, lod, lod, lod, direct |

Probe frames are included, not discarded. Fixed LOD is retained as an unranked diagnostic in the primary table; its timing and quality controls are not mixed with the automatic renderer.

## Evidence and conditions

180 image pairs, 6480 timed frames and 4608 warmups independently checked in Python/NumPy. 0 failed cases retained.

Power, thermal state and unrelated system activity were not controlled. Treat this as a two-trial device-specific test, not a statistical ranking or a cross-cohort runtime improvement.

[Summary and rankings](summary.json) · [Every frame and image-error numerator](results.json.gz) · [Independent verification](verification.json) · [Frozen protocol and reproduction](../../LARGE.md)

## Inputs and credits

[Rocca di Montecatini Alto](https://superspl.at/scene/abdf12c6) by enryt · [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) · 7,049,716 splats · SH3. Entire published LOD 0 plus 0 environment splats; no extra filtering.

[Wat Paknam Bhasicaroen](https://superspl.at/scene/905ec260) by ethan3111 · [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) · 8,845,461 splats · SH0. Entire published source; no filtering or extra parameter quantization.

[LCC2Rock](https://superspl.at/scene/157bad1d) by kumar3ar · [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) · 12,245,931 splats · SH0. Entire published LOD 0 plus 26349 environment splats; no extra filtering.

Scans, reduced banks and raw image captures stay out of the published repository. Source and image digests in the numeric archive identify the exact local inputs checked.
