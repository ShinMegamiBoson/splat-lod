"""Use one predeclared cube-size rule for every new large benchmark input."""
import argparse
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/splat-lod'))
from build_lod import build
from ply_source import load_source


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    source = load_source(args.source)
    lo, hi = np.quantile(source.pos, [.01, .99], axis=0)
    edge = float(np.max(hi - lo) / 32)
    if not np.isfinite(edge) or edge <= 0:
        raise ValueError('Degenerate source extent')
    print(json.dumps({'cubeSizeRule': 'max-axis-central-98-percent-extent / 32', 'cellSize': edge}), flush=True)
    del source
    build(args.source, args.output, edge)
