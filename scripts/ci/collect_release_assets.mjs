// Copies the built bundles of one platform into <outDir> with their release names and
// fails when any expected asset is missing, so an incomplete release is never published.
// Usage: node scripts/ci/collect_release_assets.mjs <windows|macos|linux|android> <version> <outDir>
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { ROOT_DIR, getExpectedAssets } from './release_assets.mjs';

const [platform, version, outDir] = process.argv.slice(2);
if (!platform || !version || !outDir) {
    console.error('Usage: node scripts/ci/collect_release_assets.mjs <windows|macos|linux|android> <version> <outDir>');
    process.exit(1);
}

const resolve = (relativePath) => path.join(ROOT_DIR, relativePath);
const outPath = path.resolve(outDir);
fs.mkdirSync(outPath, { recursive: true });

function findSource(source) {
    if (source.file) {
        const file = resolve(source.file);
        return fs.existsSync(file) ? file : null;
    }
    if (source.dir) {
        const dir = resolve(source.dir);
        if (!fs.existsSync(dir)) return null;
        const match = fs.readdirSync(dir).find(entry => entry.endsWith(source.ext));
        return match ? path.join(dir, match) : null;
    }
    return null;
}

const expected = getExpectedAssets(version).filter(asset => asset.platform === platform);
if (expected.length === 0) {
    console.error(`::error::Unknown platform "${platform}"`);
    process.exit(1);
}

const missing = [];
for (const asset of expected) {
    const target = path.join(outPath, asset.name);

    if (asset.source.tarDir) {
        const tarDir = resolve(asset.source.tarDir);
        if (!fs.existsSync(path.join(tarDir, asset.source.entry))) {
            missing.push(asset.name);
            continue;
        }
        execFileSync('tar', ['-czf', target, '-C', tarDir, asset.source.entry], { stdio: 'inherit' });
    } else {
        const source = findSource(asset.source);
        if (!source) {
            missing.push(asset.name);
            continue;
        }
        fs.copyFileSync(source, target);
    }
    console.log(`Collected ${asset.name}`);
}

if (missing.length > 0) {
    console.error(`::error::Missing ${platform} release assets: ${missing.join(', ')}`);
    process.exit(1);
}
