import assert from 'node:assert/strict';

// Rank full-precision measurements, not the rounded strings in a table. A
// missing/failed configuration is not eligible and never becomes a zero time.
export function rankRenderers(rows, modes, nearTieFraction = 0.05) {
    assert(modes.length >= 2 && new Set(modes).size === modes.length);
    assert(Number.isFinite(nearTieFraction) && nearTieFraction >= 0);
    const eligible = [], excluded = [];
    for (const mode of modes) {
        const matches = rows.filter(row => row.mode === mode);
        assert(matches.length <= 1, `Duplicate result for ${mode}`);
        const row = matches[0], ms = row?.movingMs?.median;
        if (row?.passed && Number.isFinite(ms) && ms > 0) eligible.push({ mode, ms });
        else excluded.push(mode);
    }
    eligible.sort((a, b) => a.ms - b.ms);
    const best = eligible[0];
    const winners = best ? eligible.filter(row => row.ms === best.ms).map(row => row.mode) : [];
    const runnerUp = eligible.length >= 2 ? eligible[1] : null;
    const speedup = runnerUp ? runnerUp.ms / best.ms : null;
    return { eligible,
        excluded,
        complete: excluded.length === 0,
        winners,
        runnerUp,
        speedup,
        nearTie: speedup !== null && speedup <= 1 + nearTieFraction };
}
