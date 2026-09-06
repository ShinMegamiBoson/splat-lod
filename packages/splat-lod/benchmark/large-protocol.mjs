import { BENEFIT_PROTOCOL } from './benefit-protocol.mjs';

// Freeze before timing. Rank renderer configurations, not the fixed-LOD diagnostic.
export const LARGE_PROTOCOL = Object.freeze({
    ...BENEFIT_PROTOCOL,
    version: 5,
    modes: ['pc-full', 'ours-auto', 'pc-default', 'spark', 'luma', 'ours-fixed'],
    rankedModes: ['pc-full', 'ours-auto', 'pc-default', 'spark', 'luma'],
    rankingMetric: 'moving-completed-frame-median-ms',
    runnerUpSpeedup: 'second-smallest eligible median / smallest eligible median',
    nearTieFraction: 0.05
});
