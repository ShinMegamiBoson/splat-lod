export const RENDER_PROFILES = Object.freeze({
    exact: Object.freeze({ minPixelSize: 0, minContribution: 0 }),
    contribution: Object.freeze({ minPixelSize: 0, minContribution: 3 }),
    playcanvas: Object.freeze({ minPixelSize: 2, minContribution: 3 })
});

export function renderSettings({ profile = 'exact', shMode = 'visible', colorUpdateAngle = 10 } = {}) {
    if (!Object.hasOwn(RENDER_PROFILES, profile)) throw new RangeError('Unknown render profile');
    if (!['visible', 'cached'].includes(shMode)) throw new RangeError('SH mode must be visible or cached');
    if (!Number.isFinite(colorUpdateAngle) || colorUpdateAngle < 0 || colorUpdateAngle > 180) throw new RangeError('SH update angle must be in [0,180]');
    return Object.freeze({ profile, shMode, ...RENDER_PROFILES[profile], colorUpdateAngle: shMode === 'visible' ? 0 : colorUpdateAngle });
}
