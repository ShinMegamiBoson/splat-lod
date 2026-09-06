const privatePath = /\bfile:\/\/|\/(?:Users|home)\/|[a-z]:[\\/]Users[\\/]/i;
const privateKeys = new Set([
    'username', 'hostname', 'machinename', 'homedirectory', 'localpath', 'localdirectory',
    'rawlocalproof', 'serialnumber', 'macaddress', 'batterypercent', 'batterystate',
    'powersource', 'pmsetthermal'
]);

// Reject personal provenance before writing; never silently alter measured samples.
export function assertPublicText(text, label = 'publication') {
    if (privatePath.test(text)) throw new Error(`Private machine path in ${label}`);
}

export function assertPublicData(value, label = 'publication') {
    if (typeof value === 'string') {
        assertPublicText(value, label);
    } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            if (privateKeys.has(key.toLowerCase())) throw new Error(`Private machine metadata in ${label}: ${key}`);
            assertPublicData(child, label);
        }
    }
}
