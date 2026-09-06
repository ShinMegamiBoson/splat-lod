"""Strict SH3 PLY input. IDs stay in file order; no reordering or intermediate quantization."""
import hashlib
from pathlib import Path
import numpy as np
from compressed import CompressedPlySource
from moments import rotation

FIELDS = ['x', 'y', 'z'] + [f'f_dc_{i}' for i in range(3)]
FIELDS += [f'f_rest_{i}' for i in range(45)] + ['opacity']
FIELDS += [f'scale_{i}' for i in range(3)] + [f'rot_{i}' for i in range(4)]


def ply_header(count):
    return ('ply\nformat binary_little_endian 1.0\nelement vertex ' + str(count) + '\n'
            + ''.join('property float ' + f + '\n' for f in FIELDS) + 'end_header\n').encode()


def read_header(filename):
    with Path(filename).open('rb') as stream:
        header = bytearray()
        while not header.endswith(b'end_header\n'):
            line = stream.readline(65537)
            if not line or len(header) + len(line) > 65536:
                raise ValueError('Invalid or oversized PLY header')
            header.extend(line)
    lines = header.decode('ascii').splitlines()
    if lines[:2] != ['ply', 'format binary_little_endian 1.0']:
        raise ValueError('Only binary little-endian PLY is supported')
    return header, lines


class FloatPlySource:
    def __init__(self, filename):
        self.filename = Path(filename)
        header, lines = read_header(filename)
        elements = [line.split() for line in lines if line.startswith('element ')]
        props = [line.split()[1:] for line in lines if line.startswith('property ')]
        if len(elements) != 1 or elements[0][1] != 'vertex' or any(p[0] != 'float' or len(p) != 2 for p in props):
            raise ValueError('Expected one float32 vertex element with SH3 fields')
        names = [p[1] for p in props]
        count = int(elements[0][2])
        if count < 2 or count > 0xffffffff or len(set(names)) != len(names) or any(f not in names for f in FIELDS):
            raise ValueError('Invalid vertex count, duplicate fields, or missing SH3 fields')
        if self.filename.stat().st_size != len(header) + count * len(props) * 4:
            raise ValueError('PLY payload length mismatch')
        self.rows = np.memmap(filename, mode='r', dtype='<f4', offset=len(header), shape=(count, len(props)))
        self.indices = np.array([names.index(f) for f in FIELDS])
        with self.filename.open('rb') as stream:
            self.fingerprint = hashlib.file_digest(stream, 'sha256').hexdigest()
        self.pos = np.array(self.rows[:, self.indices[:3]], dtype=np.float32)
        self.support = 3 * np.exp(self.rows[:, self.indices[52:55]]).max(-1)

    def decode(self, ids):
        rows = self.rows[np.asarray(ids)][..., self.indices]
        if not np.isfinite(rows).all():
            raise ValueError('Nonfinite splat parameters')
        scale = np.exp(rows[..., 52:55])
        q = rows[..., [56, 57, 58, 55]].copy()
        norm = np.linalg.norm(q, axis=-1, keepdims=True)
        if (norm <= 1e-12).any() or not np.isfinite(scale).all() or (scale <= 0).any():
            raise ValueError('Degenerate splat scale or quaternion')
        q /= norm
        r = rotation(q)
        cov = (r * scale[..., None, :]) @ (r * scale[..., None, :]).swapaxes(-1, -2)
        opacity = 1 / (1 + np.exp(-np.clip(rows[..., 51], -80, 80)))
        sh = np.concatenate([rows[..., 3:6][..., None, :], rows[..., 6:51].reshape(*rows.shape[:-1], 3, 15).swapaxes(-1, -2)], axis=-2)
        return rows[..., :3], cov, scale, opacity, sh


def load_source(filename):
    _, lines = read_header(filename)
    source = CompressedPlySource(filename) if any(l.startswith('element chunk ') for l in lines) else FloatPlySource(filename)
    if len(source.pos) < 2 or not np.isfinite(source.pos).all() or not np.isfinite(source.support).all() or (source.support <= 0).any():
        raise ValueError('Invalid source positions or scales')
    return source
