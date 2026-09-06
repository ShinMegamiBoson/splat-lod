import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { expect } from 'chai';

import { assertPublicData, assertPublicText } from '../../packages/splat-lod/benchmark/publication-privacy.mjs';

describe('public benchmark privacy', function () {
    it('rejects personal paths and machine identifiers without echoing their values', function () {
        for (const text of ['/Users/example/scene.ply', '/home/example/scene.ply', 'C:\\Users\\example\\scene.ply', 'file:///private/scene.ply']) {
            expect(() => assertPublicData({ nested: [{ input: text }] })).to.throw('Private machine path');
            try {
                assertPublicText(text);
            } catch (error) {
                expect(error.message).not.to.include(text);
            }
        }
        for (const key of ['userName', 'hostName', 'machineName', 'serialNumber', 'rawLocalProof', 'batteryPercent', 'powerSource']) {
            expect(() => assertPublicData({ nested: { [key]: 'private' } })).to.throw('Private machine metadata');
        }
    });

    it('keeps benchmark specs, source credits, portable instructions and numerical data unchanged', function () {
        const value = { hardware: { cpu: 'Example GPU', memoryBytes: 1024, os: 'Example OS', browser: 'Example browser' },
            source: '/data/scene/source.ply',
            creator: 'Third-party creator',
            docs: 'Start http://localhost:8016 and provide /absolute/path/source.ply',
            sourceSha256: 'abc123',
            powerStateTrackedDuringRun: false,
            samples: [{ completeMs: 5.25 }],
            squared: 1204 };
        const before = JSON.stringify(value);
        expect(() => assertPublicData(value)).not.to.throw();
        expect(JSON.stringify(value)).to.equal(before);
    });

    it('checks published documentation, validation records and compressed frame archives', function () {
        const repo = new URL('../../', import.meta.url);
        // Ignored input configs and raw captures are private, not publication candidates.
        const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'README.md', 'packages/splat-lod'], { cwd: repo, encoding: 'utf8' });
        const files = candidates.split('\0').filter(name => /\.(?:md|json|gz)$/.test(name))
        .map(name => new URL(name, repo)).filter(file => existsSync(file));
        expect(files.length).to.be.greaterThan(150);
        for (const file of files) {
            const bytes = readFileSync(file);
            const text = (file.pathname.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString();
            if (/\.(?:json|gz)$/.test(file.pathname)) assertPublicData(JSON.parse(text), file.pathname.split('/').at(-1));
            else assertPublicText(text, file.pathname.split('/').at(-1));
        }
    });
});
