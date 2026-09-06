import json
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/splat-lod'))
from build_lod import build, digest
from make_example import make_example
from ply_source import load_source, ply_header, FIELDS, ply_fields
from cubes import cube_partition, cube_groups
from moments import moment_parent
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/splat-lod/benchmark'))
from export_luma import export


class PreprocessingTest(unittest.TestCase):
    def test_cube_ownership_and_ragged_groups(self):
        positions = np.array([[.1, 0, 0], [.2, 0, 0], [.3, 0, 0], [1.1, 0, 0], [-.1, 0, 0]], np.float32)
        part = cube_partition(positions, 1)
        self.assertEqual(sorted(part['order'].tolist()), list(range(5)))
        self.assertEqual(np.diff(part['offsets']).tolist(), [1, 3, 1])
        groups = cube_groups(part['offsets'], 2)
        self.assertEqual(groups['owner'].tolist(), [1, 1])
        self.assertEqual(groups['sizes'].tolist(), [2, 1])
        with self.assertRaises(ValueError): cube_partition(positions, 0)

    def test_moments_preserve_identical_gaussian_and_all_sh_terms(self):
        p = np.array([[[0., 0, 0], [0., 0, 0]]], np.float32)
        s = np.ones((1, 2, 3), np.float32) * .1
        cov = np.broadcast_to(np.eye(3) * .01, (1, 2, 3, 3))
        opacity = np.ones((1, 2), np.float32) * .3
        sh = np.broadcast_to(np.arange(48, dtype=np.float32).reshape(1, 1, 16, 3) / 48, (1, 2, 16, 3))
        row = moment_parent(p, cov, s, opacity, sh)[0]
        np.testing.assert_allclose(row[:3], 0, atol=1e-6)
        np.testing.assert_allclose(np.exp(row[52:55]), .1, atol=1e-6)
        self.assertAlmostEqual(float(1 / (1 + np.exp(-row[51]))), .51, places=5)
        np.testing.assert_allclose(row[6:51].reshape(3, 15).T, sh[0, 0, 1:], atol=1e-6)

    def test_complete_standalone_build_digests_counts_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source.ply'
            self.assertEqual(make_example(source), 16384)
            src = load_source(source)
            self.assertEqual(src.decode(np.array([0, 100, 8000]))[-1].shape, (3, 16, 3))
            output = root / 'lod'
            m = build(source, output, .25)
            self.assertTrue(m['complete'])
            self.assertEqual(m['sourceCount'], 16384)
            self.assertEqual(m['sourceSha256'], digest(source))
            order = np.fromfile(output / m['sourceOrder'], '<u4')
            np.testing.assert_array_equal(np.sort(order), np.arange(16384))
            for name, info in m['files'].items():
                self.assertEqual((output / name).stat().st_size, info['bytes'])
                self.assertEqual(digest(output / name), info['sha256'])
            offsets = np.fromfile(output / 'source-offsets.u32', '<u4')
            for level in m['levels']:
                bank = load_source(output / level['file'])
                self.assertEqual(len(bank.pos), level['splats'])
                self.assertEqual(digest(output / level['file']), level['sha256'])
                expected = np.ceil(np.diff(offsets) / level['span']).astype(int)
                expected[np.diff(offsets) <= 1] = 0
                np.testing.assert_array_equal(np.diff(np.fromfile(output / level['offsets'], '<u4')), expected)
            with self.assertRaises(FileExistsError): build(source, output, .25)

    def test_invalid_ply_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'bad.ply'
            source.write_bytes(ply_header(2))
            with self.assertRaises(ValueError): load_source(source)

    def test_sh0_keeps_native_dc_without_inventing_higher_coefficients(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            make_example(root / 'sh3.ply')
            full = load_source(root / 'sh3.ply')
            columns = [FIELDS.index(f) for f in ply_fields(0)]
            rows = np.array(full.rows[:64, columns])
            source = root / 'sh0.ply'
            source.write_bytes(ply_header(len(rows), 0) + rows.astype('<f4').tobytes())
            decoded = load_source(source)
            self.assertEqual(decoded.sh_bands, 0)
            sh = decoded.decode(np.array([0, 4, 20]))[-1]
            np.testing.assert_array_equal(sh[:, 1:], 0)
            np.testing.assert_array_equal(sh[:, 0], rows[[0, 4, 20], 3:6])
            manifest = build(source, root / 'lod', .25)
            self.assertEqual(manifest['shBands'], 0)
            for level in manifest['levels']:
                bank = load_source(root / 'lod' / level['file'])
                self.assertEqual(bank.sh_bands, 0)
                self.assertEqual(len(bank.pos), level['splats'])
                np.testing.assert_array_equal(bank.decode(np.array([0]))[-1][:, 1:], 0)

    def test_luma_pages_preserve_native_sh0_and_sh3_parameters(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            make_example(root / 'full.ply')
            full = load_source(root / 'full.ply')
            for bands in (0, 3):
                columns = [FIELDS.index(f) for f in ply_fields(bands)]
                rows = np.array(full.rows[:64, columns])
                source = root / f'sh{bands}.ply'
                source.write_bytes(ply_header(len(rows), bands) + rows.astype('<f4').tobytes())
                output = root / f'pages{bands}'
                export(source, output)
                manifest = json.loads((output / 'manifest.json').read_text())
                self.assertEqual(manifest['shDegree'], bands)
                self.assertEqual(manifest['sourceSha256'], digest(source))
                self.assertEqual(manifest['count'], 64)
                page = output / manifest['pages'][0]['file']
                self.assertEqual(digest(page), manifest['pages'][0]['sha256'])
                flat = np.fromfile(page, '<f4')
                self.assertEqual(len(flat), 64 * (60 if bands else 15))
                p, cov, scales, opacity, sh = load_source(source).decode(np.arange(64))
                np.testing.assert_array_equal(flat[:64*3].reshape(64, 3), p)
                np.testing.assert_allclose(flat[64*3:64*6].reshape(64, 3), scales)
                q = flat[64*6:64*10].reshape(64, 4)
                np.testing.assert_allclose(np.linalg.norm(q, axis=1), 1, atol=1e-6)
                color = flat[64*10:64*14].reshape(64, 4)
                np.testing.assert_allclose(color[:, :3], sh[:, 0] * .28209479177387814 + .5)
                np.testing.assert_array_equal(color[:, 3], 1)
                np.testing.assert_allclose(flat[64*14:64*15], opacity)
                if bands:
                    np.testing.assert_array_equal(flat[64*15:].reshape(64, 15, 3), sh[:, 1:])


if __name__ == '__main__': unittest.main()
