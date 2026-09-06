import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SCENES } from './scenes.mjs';
import { MAIN_PROTOCOL } from './main-protocol.mjs';
import { BENEFIT_PROTOCOL } from './benefit-protocol.mjs';
import { LARGE_PROTOCOL } from './large-protocol.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const large = process.argv.includes('--large');
const benefit = process.argv.includes('--benefit');
const main = process.argv.includes('--main') || benefit || large;
const config = JSON.parse(await readFile(path.join(root, large ? 'config-large.local.json' : main ? 'config-main.local.json' : 'config.local.json')));
const fileHash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const publicConfig = { libraryRevision: main ? revision : '21bf25a67082af374fd899b6d91846381bb89c89',
    evidence: { harnessRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        librarySha256: await fileHash(path.resolve(root, config.bundle)),
        harnessSha256: await fileHash(path.join(root, main ? 'build/main-runner.js' : 'build/runner.js')),
        ...(main ? { upstreamRevision: MAIN_PROTOCOL.engineRevision, upstreamBundleSha256: await fileHash(path.resolve(root, '../../../build/playcanvas.min.mjs')) } : {}),
        dependencyLockSha256: await fileHash(path.join(root, 'package-lock.json')) },
    ...(main ? { protocol: large ? LARGE_PROTOCOL : benefit ? BENEFIT_PROTOCOL : MAIN_PROTOCOL } : {}),
    scenes: main ? config.scenes : SCENES };
const port = Number(process.env.PORT || 8016);
const beneath = (dir, name) => {
    const file = path.resolve(dir, `.${name}`);
    if (!file.startsWith(`${path.resolve(dir)}/`)) throw new Error('Invalid path');
    return file;
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${port}`), route = decodeURIComponent(url.pathname);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        if (req.method === 'POST') {
            if (![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) throw new Error('Invalid origin');
            const match = /^\/save\/([\w-]+)\/(\d+)\/(report\.json|quality-\d\.rgba)$/.exec(route);
            if (!match) throw new Error('Invalid report destination');
            const chunks = []; let size = 0;
            for await (const chunk of req) {
                size += chunk.length; if (size > 32 * 1024 ** 2) throw new Error('Report too large'); chunks.push(chunk);
            }
            const dir = path.join(root, 'results', match[1], match[2]); await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, match[3]), Buffer.concat(chunks), { flag: 'wx' });
            res.writeHead(200); res.end('Saved'); return;
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405); res.end(); return;
        }
        if (route === '/config.json') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(publicConfig)); return;
        }
        let file;
        if (route === '/') file = path.join(root, 'index.html');
        else if (route === '/runner.js') file = path.join(root, main ? 'build/main-runner.js' : 'build/runner.js');
        else if (route === '/ours.js') file = path.resolve(root, config.bundle);
        else if (route.startsWith('/data/')) {
            const [, , key, ...parts] = route.split('/');
            if (!config.mounts[key]) throw new Error('Unknown data mount');
            file = beneath(config.mounts[key], `/${parts.join('/')}`);
        } else throw new Error('Unknown route');
        const info = await stat(file); if (!info.isFile()) throw new Error('Not a file');
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size });
        if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
    } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end(error.message);
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Benchmark: http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
