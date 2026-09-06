import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const example = fileURLToPath(new URL('../../examples/src/examples/splat-lod/', import.meta.url));
const assets = process.env.SPLAT_LOD_ASSETS_ROOT;
const config = process.env.SPLAT_LOD_DEMO_CONFIG;
const bundle = process.env.SPLAT_LOD_BUNDLE || path.join(here, 'build/index.js');
const exampleAssets = process.env.SPLAT_LOD_EXAMPLE_ROOT || path.join(here, 'example-data/lod');
const port = Number(process.env.SPLAT_LOD_PORT || 8015);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ply': 'application/octet-stream' };

function beneath(root, suffix) {
    const file = path.resolve(root, `.${suffix}`);
    if (file !== path.resolve(root) && !file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Invalid path');
    return file;
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`), route = decodeURIComponent(url.pathname);
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'POST' && route === '/proof') {
            if (req.headers.origin !== `http://localhost:${port}` && req.headers.origin !== `http://127.0.0.1:${port}`) throw new Error('Invalid proof origin');
            let size = 0;
            const chunks = [];
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 2 ** 20) throw new Error('Proof too large');
                chunks.push(chunk);
            }
            const report = JSON.parse(Buffer.concat(chunks).toString());
            await mkdir(path.join(here, '.proof'), { recursive: true });
            const name = `proof-${Date.now()}.json`;
            await writeFile(path.join(here, '.proof', name), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ saved: name })); return;
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405); res.end(); return;
        }
        if (route === '/config.json') {
            const body = config ? await readFile(config) : JSON.stringify({ manifestUrl: '/example/manifest.json', camera: { position: [2.6, 1.6, 3.2], target: [0, 0, 0] }, movementSpeed: 1.5 });
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? undefined : body); return;
        }
        let file;
        if (route === '/' || route === '/index.html') file = path.join(example, 'index.html');
        else if (route === '/bundle.js') file = bundle;
        else if (route.startsWith('/example/')) file = beneath(exampleAssets, route.slice(8));
        else if (route.startsWith('/assets/') && assets) file = beneath(assets, route.slice(7));
        else file = beneath(example, route);
        const info = await stat(file);
        if (!info.isFile()) throw new Error('Not a file');
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size });
        if (req.method === 'HEAD') res.end();
        else createReadStream(file).pipe(res);
    } catch (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end(`Not available: ${error.message}`);
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Standalone demo: http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
