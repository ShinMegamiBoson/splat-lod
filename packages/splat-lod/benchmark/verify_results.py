"""Independent NumPy recomputation of every published timing/quality result."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np


def verify(directory):
    summary = json.loads((directory / 'results.json').read_text())
    p = summary['protocol']
    expected = len(summary['scenes']) * len(p['modes']) * p['repeats']
    assert p['version'] in (2, 3, 4, 5)
    assert summary['reportCount'] == expected
    if p['version'] < 5:
        assert summary['passedCount'] == expected
    assert (p['width'], p['height']) == (2560, 1440)
    reports = summary['reports']
    passed_count = sum(bool(r['passed']) for r in reports)
    assert summary['passedCount'] == passed_count
    assert sorted(r['index'] for r in reports) == list(range(expected))
    image_checks = 0
    warmup_frames = 0
    direct_bypass_checks = 0
    for r in reports:
        assert not r['pilot']
        assert r['browserViewport'] == [1280, 720]
        assert r['evidence'] == reports[0]['evidence']
        if not r['passed']:
            assert p['version'] == 5 and (r.get('error') or r.get('disposeError'))
            continue
        if p['version'] >= 4:
            for phase in ('static', 'moving'):
                warmups = r['warmups'][phase]
                assert len(warmups) == p['warmup']
                assert np.isfinite([s['completeMs'] for s in warmups]).all()
                warmup_frames += len(warmups)
            if r['mode'].startswith('ours-'):
                groups = [r['warmups'][phase] + r['phases'][phase]['samples'] for phase in ('static', 'moving')]
                groups.append(r['interactive']['frames'])
                for group in groups:
                    previous = None
                    for sample in group:
                        trace = sample['path']
                        assert trace['path'] in ('direct', 'lod')
                        if r['mode'] == 'ours-direct':
                            assert trace['path'] == 'direct' and not trace['probing']
                        if r['mode'] == 'ours-fixed':
                            assert trace['path'] == 'lod' and not trace['probing']
                        if previous and trace['path'] == 'direct':
                            assert trace['selections'] == previous['selections']
                            assert trace['prefixScans'] == previous['prefixScans']
                            assert trace['bankDispatches'] - previous['bankDispatches'] == 1
                            direct_bypass_checks += 1
                        previous = trace
        reference = next(a for a in reports if a['scene']['id'] == r['scene']['id'] and a['mode'] == 'pc-full' and a['round'] == r['round'])
        for i, error in enumerate(r['errors']):
            first = (directory / str(reference['index']) / f'quality-{i}.rgba').read_bytes()
            second = (directory / str(r['index']) / f'quality-{i}.rgba').read_bytes()
            assert hashlib.sha256(first).hexdigest() == error['referenceSha256']
            assert hashlib.sha256(second).hexdigest() == error['candidateSha256']
            a = np.frombuffer(first, np.uint8).reshape(-1, 4)[:, :3].astype(np.int32)
            b = np.frombuffer(second, np.uint8).reshape(-1, 4)[:, :3].astype(np.int32)
            foreground = np.any(np.abs(a - r['scene']['background']) > 3, axis=1)
            squared = (a - b) ** 2
            total = int(squared.sum(dtype=np.uint64))
            foreground_total = int(squared[foreground].sum(dtype=np.uint64))
            assert total == error['squared']
            assert foreground_total == error['foregroundSquared']
            assert int(foreground.sum()) == error['foregroundPixels']
            if total:
                psnr = 10 * np.log10(255 ** 2 * a.size / total)
                assert abs(float(psnr) - error['psnrDb']) < 1e-9
            if foreground_total:
                psnr = 10 * np.log10(255 ** 2 * foreground.sum() * 3 / foreground_total)
                assert abs(float(psnr) - error['foregroundPsnrDb']) < 1e-9
            image_checks += 1
    for row in summary['rows']:
        trials = [r for r in reports if r['scene']['id'] == row['scene'] and r['mode'] == row['mode']]
        assert len(trials) == p['repeats'] and {r['round'] for r in trials} == set(range(p['repeats']))
        assert row['passed'] == all(r['passed'] for r in trials)
        if not row['passed']:
            assert p['version'] == 5 and row['failures']
            assert 'movingMs' not in row and 'minPsnrDb' not in row
            continue
        for phase in ('static', 'moving'):
            samples = [s['completeMs'] for r in trials for s in r['phases'][phase]['samples']]
            assert len(samples) == p['samples'] * p['repeats'] and np.isfinite(samples).all()
            assert abs(float(np.median(samples)) - row[f'{phase}Ms']['median']) < 1e-9
            assert abs(float(np.quantile(samples, .95)) - row[f'{phase}Ms']['p95']) < 1e-9
            if p['version'] >= 4 or 'mean' in row[f'{phase}Ms']:
                assert abs(float(np.mean(samples)) - row[f'{phase}Ms']['mean']) < 1e-9
        quality = [e for r in trials for e in r['errors']]
        if row['mode'] != 'pc-full':
            for field, squared, metric in [('psnrDb', 'squared', 'minPsnrDb'), ('foregroundPsnrDb', 'foregroundSquared', 'minForegroundPsnrDb')]:
                value = min(np.inf if e[squared] == 0 else e[field] for e in quality)
                if np.isfinite(value):
                    assert abs(value - row[metric]) < 1e-9
                else:
                    assert row[metric] is None
    result = {'passed': True, 'independentImplementation': 'Python / NumPy', 'qualityPairsChecked': image_checks,
              'timingRowsChecked': sum(bool(r['passed']) for r in summary['rows']),
              'failedCasesRetained': expected - passed_count, 'timedFramesChecked': passed_count * p['samples'] * 2,
              'summarySha256': hashlib.sha256((directory / 'results.json').read_bytes()).hexdigest()}
    if p['version'] >= 4:
        assert warmup_frames == passed_count * p['warmup'] * 2
        result.update(warmupFramesChecked=warmup_frames, directBypassTransitionsChecked=direct_bypass_checks)
    (directory / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    verify(parser.parse_args().directory)
