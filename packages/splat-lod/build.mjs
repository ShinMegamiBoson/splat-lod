import { copyFile, mkdir, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildTarget } from '../../utils/esbuild-build-target.mjs';

// Reuse the upstream release transforms, including shader normalization and debug stripping.
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const dir = 'packages/splat-lod/build';
await buildTarget({ moduleFormat: 'esm', buildType: 'min', input: `${root}src/framework/splat-lod/index.js`, dir: `${root}${dir}`, preserveModules: false });
await rename(`${dir}/playcanvas.min.mjs`, `${dir}/index.js`);
await copyFile('packages/splat-lod/index.d.ts', `${dir}/index.d.ts`);
await copyFile('LICENSE', 'packages/splat-lod/LICENSE');
await mkdir(`${dir}/tools`, { recursive: true });
await Promise.all((await readdir('scripts/splat-lod'))
.filter(name => name.endsWith('.py') || name === 'requirements.txt')
.map(name => copyFile(`scripts/splat-lod/${name}`, `${dir}/tools/${name}`)));
await copyFile('src/framework/splat-lod/cube-policy-defaults.json', `${dir}/tools/cube-policy-defaults.json`);
console.log(`Built standalone ESM bundle and preprocessing tools in ${dir}`);
