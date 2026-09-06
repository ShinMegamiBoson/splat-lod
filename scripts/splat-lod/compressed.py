"""Source-order SuperSplat PLY decoding for the existing cube moment reducer.

Matches PlayCanvas GSplatCompressedData.decompress(), including all 45 SH-rest
values. No Spark repacking, source sampling, or lossy intermediate asset.
"""
from pathlib import Path
import hashlib
import numpy as np

CHUNK_FIELDS = [f'{limit}_{axis}' for limit in ('min', 'max') for axis in ('x', 'y', 'z')]
CHUNK_FIELDS += [f'{limit}_scale_{axis}' for limit in ('min', 'max') for axis in ('x', 'y', 'z')]
CHUNK_FIELDS += [f'{limit}_{axis}' for limit in ('min', 'max') for axis in ('r', 'g', 'b')]


class CompressedPlySource:
    def __init__(self, filename, expected_count=None, expected_sha256=None):
        self.filename = Path(filename)
        with self.filename.open('rb') as stream:
            self.fingerprint = hashlib.file_digest(stream, 'sha256').hexdigest()
            stream.seek(0)
            header = bytearray()
            while not header.endswith(b'end_header\n'):
                line = stream.readline()
                if not line or len(header) > 65536:
                    raise ValueError('Invalid compressed PLY header')
                header.extend(line)
        elements = []
        lines = header.decode('ascii').splitlines()
        if lines[:2] != ['ply', 'format binary_little_endian 1.0']:
            raise ValueError('Expected little-endian binary PLY')
        for line in lines[2:]:
            words = line.split()
            if words[0] == 'element':
                elements.append([words[1], int(words[2]), []])
            elif words[0] == 'property':
                elements[-1][2].append(tuple(words[1:]))
        if len(elements) != 3 or [e[0] for e in elements] != ['chunk', 'vertex', 'sh']:
            raise ValueError('Expected compressed chunk / vertex / SH3 elements')
        chunks, vertex, sh = elements
        n = vertex[1]
        if chunks[1] != (n + 255) // 256 or sh[1] != n or (expected_count is not None and n != expected_count):
            raise ValueError('Compressed PLY count mismatch')
        if expected_sha256 is not None and self.fingerprint != expected_sha256:
            raise ValueError('Compressed PLY source digest mismatch')
        if chunks[2] != [('float', p) for p in CHUNK_FIELDS] or vertex[2] != [('uint', 'packed_' + p) for p in ('position', 'rotation', 'scale', 'color')] or sh[2] != [('uchar', f'f_rest_{i}') for i in range(45)]:
            raise ValueError('Unsupported compressed PLY property layout')
        offset = len(header)
        self.chunks = np.memmap(filename, mode='r', dtype='<f4', offset=offset, shape=(chunks[1], 18))
        offset += chunks[1] * 72
        self.vertices = np.memmap(filename, mode='r', dtype='<u4', offset=offset, shape=(n, 4))
        offset += n * 16
        self.sh_bytes = np.memmap(filename, mode='r', dtype='u1', offset=offset, shape=(n, 45))
        if self.filename.stat().st_size != offset + n * 45:
            raise ValueError('Compressed PLY payload length mismatch')
        self.pos = np.empty((n, 3), np.float32)
        self.support = np.empty(n, np.float32)
        for start in range(0, n, 65536):
            ids = np.arange(start, min(start + 65536, n))
            self.pos[ids] = self._interpolate(ids, 0, 0)
            self.support[ids] = 3 * np.exp(self._interpolate(ids, 2, 6)).max(-1)

    def _interpolate(self, ids, packed_column, chunk_column):
        packed = self.vertices[ids, packed_column]
        t = np.stack([(packed >> 21) / 2047, ((packed >> 11) & 1023) / 1023, (packed & 2047) / 2047], -1)
        c = self.chunks[ids // 256].astype(np.float64)
        return (c[..., chunk_column:chunk_column+3] * (1-t) + c[..., chunk_column+3:chunk_column+6] * t).astype(np.float32)

    def decode(self, ids):
        from moments import rotation
        ids = np.asarray(ids)
        scale = np.exp(self._interpolate(ids, 2, 6))
        packed = self.vertices[ids, 1]
        abc = (np.stack([(packed >> 20) & 1023, (packed >> 10) & 1023, packed & 1023], -1) / 1023 - .5) * np.sqrt(2)
        a, b, c = np.moveaxis(abc, -1, 0)
        d = np.sqrt(np.maximum(0, 1 - (abc * abc).sum(-1)))
        options = np.stack([np.stack(v, -1) for v in [(a,b,c,d), (d,b,c,a), (b,d,c,a), (b,c,d,a)]], -2)
        q = np.take_along_axis(options, (packed >> 30)[..., None, None], axis=-2).squeeze(-2).astype(np.float32)
        q /= np.linalg.norm(q, axis=-1, keepdims=True)
        r = rotation(q)
        covariance = (r * scale[..., None, :]) @ (r * scale[..., None, :]).swapaxes(-1, -2)
        color = self.vertices[ids, 3]
        rgb = np.stack([(color >> 24), (color >> 16) & 255, (color >> 8) & 255], -1) / 255
        bounds = self.chunks[ids // 256].astype(np.float64)
        dc = ((bounds[..., 12:15] * (1-rgb) + bounds[..., 15:18] * rgb - .5) / .28209479177387814).astype(np.float32)
        rest = (self.sh_bytes[ids].astype(np.float64) * (8/255) - 4).astype(np.float32).reshape(*ids.shape, 3, 15).swapaxes(-1, -2)
        sh = np.concatenate([dc[..., None, :], rest], -2)
        return self.pos[ids], covariance, scale, (color & 255).astype(np.float32) / 255, sh
