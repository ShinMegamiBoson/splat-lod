"""Generate a deterministic, original SH0 or SH3 torus. No third-party scene assets."""
import argparse
from pathlib import Path
import numpy as np
from ply_source import FIELDS, ply_fields, ply_header


def make_example(output, sh_bands=3):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 256, endpoint=False), np.linspace(0, 2 * np.pi, 64, endpoint=False))
    u, v = u.ravel(), v.ravel()
    rows = np.zeros((len(u), 59), dtype='<f4')
    rows[:, :3] = np.stack([(1 + .3 * np.cos(v)) * np.cos(u), .3 * np.sin(v), (1 + .3 * np.cos(v)) * np.sin(u)], axis=-1)
    rgb = np.stack([.55 + .35 * np.cos(u), .55 + .3 * np.sin(u), .5 + .3 * np.cos(v)], axis=-1)
    rows[:, 3:6] = (rgb - .5) / .28209479177387814
    rows[:, 6] = .15
    rows[:, 6 + 15 + 3] = .12
    rows[:, 6 + 30 + 10] = -.1
    rows[:, 51] = 1.4
    rows[:, 52:55] = np.log([.019, .015, .017])
    rows[:, 55] = 1
    with output.open('xb') as stream:
        stream.write(ply_header(len(rows), sh_bands))
        stream.write(rows[:, [FIELDS.index(f) for f in ply_fields(sh_bands)]].tobytes())
    return len(rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sh-bands', type=int, choices=(0, 3), default=3)
    args = parser.parse_args()
    print(make_example(args.output, args.sh_bands))
