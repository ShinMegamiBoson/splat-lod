import { expect } from 'chai';

import { renderSettings } from '../../src/framework/splat-lod/render-settings.js';

describe('raster and SH settings', function () {
    it('keeps an unfiltered current-view control', function () {
        expect(renderSettings()).to.deep.equal({ profile: 'exact', shMode: 'visible', minPixelSize: 0, minContribution: 0, colorUpdateAngle: 0 });
    });
    it('separates contribution culling, footprint culling, and SH reuse', function () {
        expect(renderSettings({ profile: 'contribution' }).minPixelSize).to.equal(0);
        expect(renderSettings({ profile: 'contribution' }).minContribution).to.equal(3);
        const defaults = renderSettings({ profile: 'playcanvas', shMode: 'cached' });
        expect(defaults.minPixelSize).to.equal(2); expect(defaults.colorUpdateAngle).to.equal(10);
        expect(renderSettings({ shMode: 'cached', colorUpdateAngle: 0 }).colorUpdateAngle).to.equal(0);
    });
    it('rejects unknown settings rather than silently changing image quality', function () {
        for (const settings of [{ profile: 'fastest' }, { profile: '__proto__' }, { shMode: 'none' }, { colorUpdateAngle: NaN }, { colorUpdateAngle: -1 }, { colorUpdateAngle: 181 }]) {
            expect(() => renderSettings(settings)).to.throw(RangeError);
        }
    });
});
