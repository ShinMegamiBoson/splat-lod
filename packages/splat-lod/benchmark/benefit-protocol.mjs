import { MAIN_PROTOCOL } from './main-protocol.mjs';

// Fixed before the new timing cohort: no scene-specific cutoffs or quality changes.
// Every warmup/probe frame is retained separately; headline rows include any
// later reprobes in the measured moving path.
export const BENEFIT_PROTOCOL = Object.freeze({
    ...MAIN_PROTOCOL,
    version: 4,
    warmup: 64,
    modes: ['pc-full', 'ours-direct', 'ours-fixed', 'ours-auto']
});
