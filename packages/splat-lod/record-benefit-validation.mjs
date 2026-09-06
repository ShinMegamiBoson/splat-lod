import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPublicData } from './benchmark/publication-privacy.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const [installed, proofFile] = process.argv.slice(2);
assert(installed && proofFile, 'Pass the installed package directory and the live Check renderer proof');
const json = async file => JSON.parse(await readFile(file));
const packageInfo = await json(path.join(installed, 'package.json'));
const runtimeSha256 = createHash('sha256').update(await readFile(path.join(installed, 'build/index.js'))).digest('hex');
const directory = path.join(root, 'benchmark/measurements/2026-09-06-benefit');
const summary = await json(path.join(directory, 'summary.json'));
const verification = await json(path.join(directory, 'verification.json'));
const proof = await json(proofFile);
assert.equal(packageInfo.version, '0.3.0');
assert.equal(runtimeSha256, summary.evidence.librarySha256);
assert(verification.passed && proof.passed && proof.bypass.passed);
assert.equal(proof.checks.length, 6);
assert.deepEqual(proof.info.viewport, summary.hardware.physicalRenderSize);
assert(proof.info.sourceHashVerified && proof.info.globalDepthSort);
const validation = { kind: 'installed-package-with-measured-lod-fallback',
    version: packageInfo.version,
    engineRevision: proof.info.engine.revision,
    runtimeSha256,
    installedPackage: true,
    installedRuntimeMatchesTimedRuntime: true,
    syntheticSH0: { sourceCount: proof.info.sourceCount,
        residentCount: proof.info.residentCount,
        chunkCount: proof.info.chunkCount,
        viewport: proof.info.viewport,
        sourceHashVerified: proof.info.sourceHashVerified,
        globalDepthSort: proof.info.globalDepthSort,
        measuredChoice: proof.info.performance,
        checks: proof.checks.map((c, i) => ({ view: i < 3 ? 'near' : 'far',
            mode: c.mode,
            path: c.stats.path,
            selected: c.gpuSelectedCount,
            decisionMismatches: c.decisionMismatches,
            idMismatches: c.mismatches,
            passed: c.passed })),
        bypass: proof.bypass,
        colorRoundTrip: proof.colorRoundTrip,
        colorChange: proof.colorChange,
        passed: proof.passed },
    fallbackControls: (await json(path.join(directory, 'fallback-controls.json'))).map(c => ({ multiplier: c.proof.info.lodMultiplier,
        performance: c.proof.info.performance,
        bypass: c.proof.bypass,
        passed: c.proof.passed })),
    benchmark: { report: 'BENEFIT-BENCHMARKS.md',
        evidence: 'benchmark/measurements/2026-09-06-benefit',
        casesPassed: summary.passedCount,
        timedFramesChecked: verification.timedFramesChecked,
        warmupFramesChecked: verification.warmupFramesChecked,
        qualityPairsChecked: verification.qualityPairsChecked,
        directBypassTransitionsChecked: verification.directBypassTransitionsChecked,
        independentVerification: verification.independentImplementation,
        inputCounts: summary.scenes.map(s => s.count),
        inputSHBands: summary.scenes.map(s => s.shBands ?? 3) },
    scope: 'Installed runtime matches the frozen benchmark. Live positive, losing and marginal cost decisions are examples, not guarantees for every frame or view. Automatic image captures may use originals after view jumps; fixed-LOD quality remains lossy.',
    passed: true };
assertPublicData(validation);
await writeFile(path.join(root, 'VALIDATION-v0.3.json'), `${JSON.stringify(validation, null, 2)}\n`);
console.log('Recorded installed runtime parity, live selection audits and independent benchmark verification.');
