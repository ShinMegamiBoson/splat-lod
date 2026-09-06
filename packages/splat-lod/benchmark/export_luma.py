"""Lossless parameter-layout conversion from SH0/SH3 Float32 PLY for luma.gl.

Use splat-transform to decode compressed input first. No filtering or merging.
Derived scan data stays local; only hashes and aggregate measurements are published.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/splat-lod'))
from ply_source import FloatPlySource


def export(source, destination):
    src = FloatPlySource(source)
    destination.mkdir(parents=True, exist_ok=False)
    pages = []
    for start in range(0, len(src.pos), 262144):
        rows = np.array(src.rows[start:start + 262144, src.indices])
        if src.sh_bands == 0:
            rows[:, 6:51] = 0
        count = len(rows)
        opacity = 1 / (1 + np.exp(-np.clip(rows[:, 51], -80, 80)))
        colors = np.ones((count, 4), np.float32)
        colors[:, :3] = rows[:, 3:6] * .28209479177387814 + .5
        quaternion = rows[:, 55:59]
        quaternion /= np.linalg.norm(quaternion, axis=1, keepdims=True)
        columns = [rows[:, :3], np.exp(rows[:, 52:55]), quaternion, colors, opacity]
        if src.sh_bands == 3:
            columns.append(rows[:, 6:51].reshape(-1, 3, 15).transpose(0, 2, 1))
        filename = f'page-{len(pages)}.bin'
        with (destination / filename).open('wb') as stream:
            for column in columns:
                stream.write(column.astype('<f4').tobytes())
        with (destination / filename).open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        pages.append({'file': filename, 'count': count, 'sha256': digest})
    (destination / 'manifest.json').write_text(json.dumps({
        'sourceSha256': src.fingerprint, 'count': len(src.pos), 'shDegree': src.sh_bands,
        'layout': 'column-major positions3 scales3 WXYZ4 linearRGBA4 opacity1' + (' basis-majorSH45' if src.sh_bands else '') + ' float32',
        'pages': pages
    }, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    export(args.source, args.destination)
