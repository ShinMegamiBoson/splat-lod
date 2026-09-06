import json
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/splat-lod'))
from build_lod import build, digest
from make_example import make_example
from ply_source import load_source, ply_header
from cubes import cube_partition, cube_groups
from moments import moment_parent


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


if __name__ == '__main__': unittest.main()
