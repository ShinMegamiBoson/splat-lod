import { PROTOCOL } from './protocol.mjs';
import { ENGINE_BASE } from '../../../src/framework/splat-lod/engine-base.js';

// Frozen before optimization timings. Same full-resolution paths and measurement
// definitions as the first report, now comparing against the exact upstream base.
export const MAIN_PROTOCOL = Object.freeze({
    ...PROTOCOL,
    version: 3,
    engineRevision: ENGINE_BASE.revision,
    modes: ['pc-full', 'ours-lod', 'ours-contribution', 'ours-defaults', 'ours-cached', 'pc-default', 'ours-source']
});

export const OPTIMIZATION_SETTINGS = Object.freeze({
    'ours-lod': Object.freeze({ profile: 'exact', shMode: 'visible' }),
    'ours-source': Object.freeze({ profile: 'exact', shMode: 'visible' }),
    'ours-contribution': Object.freeze({ profile: 'contribution', shMode: 'visible' }),
    'ours-defaults': Object.freeze({ profile: 'playcanvas', shMode: 'visible' }),
    'ours-cached': Object.freeze({ profile: 'playcanvas', shMode: 'cached', colorUpdateAngle: 10 })
});
