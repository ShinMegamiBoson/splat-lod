// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
// Bank-major exclusive prefixes retain permanent source/LOD IDs. They describe
// ranges, not a camera-sized array with one entry per selected Gaussian.
export const RANGE_BANKS = 4;
export const RANGE_GROUP_SIZE = 256;
export const RANGE_LOOKUP_WGSL = `
struct RegionRange {starts:vec4u,counts:vec4u};
struct RangeUniforms {info:vec4u};
var<private> rangeRegion:u32;
fn rangeStart()->u32 {return rangeUniforms.info.x*rangeUniforms.info.y;}
fn rangeCount()->u32 {
    if(rangeUniforms.info.w>0u){return rangeUniforms.info.w;}
    let start=rangeStart();return prefixSumBuffer[start+rangeUniforms.info.y-1u]-prefixSumBuffer[start];
}
fn rangeSplatId(index:u32)->u32 {
    if(rangeUniforms.info.w>0u){return rangeUniforms.info.z+index;}
    let start=rangeStart();let wanted=prefixSumBuffer[start]+index;
    var lo=0u;var hi=rangeUniforms.info.y-1u;
    loop {if(lo>=hi){break;}let mid=(lo+hi)>>1u;
        if(prefixSumBuffer[start+mid+1u]<=wanted){lo=mid+1u;}else{hi=mid;}}
    rangeRegion=lo;
    let local=intervals[lo].starts[rangeUniforms.info.x]+wanted-prefixSumBuffer[start+lo];
    var source=local;if(rangeUniforms.info.x==0u){source=sourceIdMap[local];}
    return rangeUniforms.info.z+source;
}`;

// CPU oracle for the exact same bank-major ranges (including zero-count gaps).
export function rangePrefixes(tags, offsets) {
    const stride = tags.length + 1, result = new Uint32Array(RANGE_BANKS * stride); let sum = 0;
    for (let bank = 0; bank < RANGE_BANKS; bank++) {
        for (let region = 0; region < stride; region++) {
            result[bank * stride + region] = sum;
            if (region < tags.length && tags[region] === bank + 1)sum += offsets[bank][region + 1] - offsets[bank][region];
        }
    }
    return result;
}
export function resolveRangeId(prefix, offsets, sourceOrder, bases, bank, index) {
    const stride = offsets[0].length, start = bank * stride;
    if (!Number.isInteger(bank) || bank < 0 || bank >= RANGE_BANKS || !Number.isInteger(index) || index < 0 || index >= prefix[start + stride - 1] - prefix[start]) throw new Error('Invalid range index');
    const target = prefix[start] + index; let lo = 0, hi = stride - 1;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1; if (prefix[start + mid + 1] <= target)lo = mid + 1; else hi = mid;
    }
    const local = offsets[bank][lo] + target - prefix[start + lo]; return bases[bank] + (bank === 0 ? sourceOrder[local] : local);
}
