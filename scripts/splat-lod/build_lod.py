"""Preprocess one SH3 PLY into exhaustive cube-local 1/2, 1/4 and 1/8 Gaussian banks.

No image rendering, Torch, model downloads, credentials, or scene-specific settings.
Existing nonempty output directories are never overwritten.
"""
import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path
import numpy as np
from cubes import cube_partition, cube_draw_bounds, cube_groups, order_within_regions
from moments import moment_parent
from ply_source import load_source, ply_header


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def default_policy():
    packed = Path(__file__).with_name('cube-policy-defaults.json')
    source = Path(__file__).resolve().parents[2] / 'src/framework/splat-lod/cube-policy-defaults.json'
    return json.loads((packed if packed.exists() else source).read_text())


def build(source_file, destination, cell_size):
    started = time.time()
    root = Path(destination)
    if root.exists() and (not root.is_dir() or any(root.iterdir())):
        raise FileExistsError('Use a new or empty output directory; existing assets are never overwritten')
    if not np.isfinite(cell_size) or cell_size <= 0:
        raise ValueError('cell-size must be positive and finite')
    src = load_source(source_file)
    policy = default_policy()
    policy['cellSize'] = cell_size
    part = cube_partition(src.pos, cell_size)
    if np.diff(part['offsets']).max() < 2:
        raise ValueError('Every cube contains one splat; increase cell-size to build nonempty LOD banks')
    draw = cube_draw_bounds(src.pos, src.support, part)
    order = order_within_regions(src.pos, part['order'], part['offsets'], leaf_size=2)
    if not np.array_equal(np.sort(order), np.arange(len(order), dtype=np.uint32)):
        raise RuntimeError('Source ownership is not a complete permutation')
    root.mkdir(parents=True, exist_ok=True)

    def progress(stage, done, total):
        value = {'stage': stage, 'processed': int(done), 'total': int(total), 'seconds': time.time() - started}
        save_json(root / 'progress.json', value)
        print(json.dumps(value), flush=True)

    progress('partitioned', len(order), len(order))
    source_name = 'source.compressed.ply' if hasattr(src, 'vertices') else 'source.ply'
    shutil.copyfile(source_file, root / source_name)
    order.astype('<u4').tofile(root / 'source-order.u32')
    part['offsets'].astype('<u4').tofile(root / 'source-offsets.u32')
    part['coordinates'].astype('<i4').tofile(root / 'coordinates.i32')
    part['bounds'].astype('<f4').tofile(root / 'cube.bounds.f32')
    levels = []
    for level in policy['levels'][1:]:
        groups = cube_groups(part['offsets'], level['span'])
        count = len(groups['owner'])
        target = root / f"level-{level['id']}.ply"
        temporary = target.with_suffix('.ply.tmp')
        with temporary.open('wb') as stream:
            stream.write(ply_header(count))
            for first in range(0, count, 8192):
                end = min(first + 8192, count)
                sizes = groups['sizes'][first:end]
                columns = np.arange(level['span'])
                valid = columns[None] < sizes[:, None]
                indices = groups['starts'][first:end, None] + np.minimum(columns[None], sizes[:, None] - 1)
                x, cov, scales, opacity, sh = src.decode(order[indices])
                opacity *= valid
                owners = groups['owner'][first:end]
                origin = part['bounds'][owners, :3]
                rows = moment_parent(x - origin[:, None], cov, scales, opacity, sh)
                rows[:, :3] += origin
                if not np.isfinite(rows).all():
                    raise RuntimeError('Nonfinite merged Gaussian')
                lo = part['coordinates'][owners] * cell_size
                if ((rows[:, :3] < lo - 1e-5) | (rows[:, :3] > lo + cell_size + 1e-5)).any():
                    raise RuntimeError('A merged Gaussian center left its cube')
                np.maximum.at(draw[:, 3], owners, np.linalg.norm(rows[:, :3] - draw[owners, :3], axis=1) + 3 * np.exp(rows[:, 52:55]).max(1))
                stream.write(rows.astype('<f4').tobytes())
                progress(f"level-{level['id']}", end, count)
        temporary.replace(target)
        offset_name = f"level-{level['id']}.offsets.u32"
        groups['offsets'].astype('<u4').tofile(root / offset_name)
        levels.append({**level, 'file': target.name, 'splats': count, 'bytes': target.stat().st_size, 'sha256': digest(target), 'offsets': offset_name})
    draw.astype('<f4').tofile(root / 'cube.draw-bounds.f32')
    names = ['source-order.u32', 'source-offsets.u32', 'coordinates.i32', 'cube.bounds.f32', 'cube.draw-bounds.f32'] + [l['offsets'] for l in levels]
    manifest = {
        'version': policy['version'], 'complete': True, 'policy': policy, 'sourceCount': len(order), 'chunkCount': len(part['bounds']),
        'source': source_name, 'sourceBytes': (root / source_name).stat().st_size, 'sourceSha256': src.fingerprint,
        'sourceOrder': 'source-order.u32', 'levels': levels,
        'files': {name: {'bytes': (root / name).stat().st_size, 'sha256': digest(root / name)} for name in names},
        'method': 'cube-kd-area-moments-sh3-v1', 'qualityQualified': False,
        'buildSeconds': time.time() - started
    }
    save_json(root / 'manifest.json', manifest)
    progress('complete', len(order), len(order))
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--cell-size', type=float, required=True, help='Cube edge length in source/world units')
    args = parser.parse_args()
    build(args.source, args.output, args.cell_size)
