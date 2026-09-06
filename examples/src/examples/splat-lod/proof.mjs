// All cases share one camera and GPU context; their order is part of the test.
function inSequence(values, action) {
    return values.reduce((previous, value) => previous.then(() => action(value)), Promise.resolve());
}

function imageError(a, b) {
    if (a.length !== b.length || !a.length) throw new Error('Mismatched images');
    let squared = 0, maximum = 0;
    for (let i = 0; i < a.length; i++) {
        if (i % 4 === 3) continue;
        const d = a[i] - b[i]; squared += d * d; maximum = Math.max(maximum, Math.abs(d));
    }
    return { exact: squared === 0, psnrDb: squared ? 10 * Math.log10(255 ** 2 / (squared / (a.length * 0.75))) : null, maximum };
}

async function readPng(url, width, height) {
    const response = await fetch(url); if (!response.ok) throw new Error(`Cannot load reference: ${url}`);
    const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' });
    if (bitmap.width !== width || bitmap.height !== height) throw new Error('Reference viewport mismatch');
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0); bitmap.close(); return context.getImageData(0, 0, width, height).data;
}

export async function runProof(renderer, config) {
    const original = renderer.getInfo(), checks = [];
    renderer.setChunkColors(false);
    const view = config.camera;
    const d = view.position.map((v, i) => v - view.target[i]);
    const near = { ...view }, far = { ...view, position: view.target.map((v, i) => v + d[i] * 8) };
    try {
        await inSequence([near, far].flatMap(camera => ['automatic', 'source', 'lower-only'].map(mode => ({ camera, mode }))), async ({ camera, mode }) => {
            renderer.setCamera(camera);
            renderer.setMode(mode);
            checks.push(await renderer.audit());
        });
        renderer.setCamera(view); renderer.setMode('automatic');
        const normal = await renderer.capture();
        renderer.setChunkColors(true); const colored = await renderer.capture();
        renderer.setChunkColors(false); const restored = await renderer.capture();
        const colorRoundTrip = imageError(normal.pixels, restored.pixels), colorChange = imageError(normal.pixels, colored.pixels);
        const references = [];
        // Optional local regression references. No private scan, image, or path is distributed.
        if (config.regression) {
            renderer.resize(config.regression.width, config.regression.height, 1);
            await inSequence(config.regression.cases, async (test) => {
                renderer.setMode('source'); renderer.render(); await renderer.flush();
                renderer.setMode(test.mode);
                await inSequence(test.samples, async (sample) => {
                    renderer.setCamera(sample.camera);
                    const image = await renderer.capture();
                    const expected = await readPng(sample.image, image.width, image.height);
                    references.push({ mode: test.mode, image: sample.image, ...imageError(expected, image.pixels), stats: await renderer.readStats() });
                });
            });
        }
        return { passed: checks.every(c => c.passed) && !colorChange.exact && (colorRoundTrip.exact || colorRoundTrip.psnrDb > 65) && references.every(r => r.exact || r.psnrDb > 65),
            info: original,
            checks,
            colorRoundTrip,
            colorChange,
            references };
    } finally {
        renderer.resize(...original.viewport, 1); renderer.setCamera(original.camera); renderer.setMode(original.mode); renderer.setChunkColors(original.chunkColors); renderer.setLodMultiplier(original.lodMultiplier);
    }
}
