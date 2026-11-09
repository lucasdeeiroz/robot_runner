import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node scripts/bump_version.js <new_version>');
    process.exit(1);
}

// Validate version format (x.y.z or x.y.z-stageX)
const versionMatch = newVersion.match(/^(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9]+)?$/);
if (!versionMatch) {
    console.error('Error: Version must be in format x.y.z or x.y.z-stageX (e.g., 2.0.1 or 2.0.1-beta4)');
    process.exit(1);
}

// Normalize version (remove leading zeros, e.g., 2.1.000 -> 2.1.0)
const major = parseInt(versionMatch[1], 10);
const minor = parseInt(versionMatch[2], 10);
const patch = parseInt(versionMatch[3], 10);
const tag = versionMatch[4] || '';

if (minor > 99 || patch > 99) {
    console.error('Error: minor and patch must be <= 99 to keep the Companion versionCode monotonic.');
    process.exit(1);
}

const normalizedVersion = `${major}.${minor}.${patch}${tag}`;

// Android versionCode must always increase: MMM_mm_pp_SS (major, minor, patch, stage).
// Stage ranks: alpha/dev 10-29, beta 30-49, rc/other 50-69, stable 70-89, plain X.Y.Z 99.
function computeStageRank() {
    const stageMatch = tag.match(/^-([a-zA-Z]+)(\d*)$/);
    if (!stageMatch) return tag ? 50 : 99;
    const name = stageMatch[1].toLowerCase();
    const number = Math.min(parseInt(stageMatch[2] || '0', 10), 19);
    const base = (name === 'alpha' || name === 'dev') ? 10
        : name === 'beta' ? 30
        : name === 'stable' ? 70
        : 50;
    return base + number;
}
const stageRank = computeStageRank();
const versionCode = major * 1_000_000 + minor * 10_000 + patch * 100 + stageRank;
if (normalizedVersion !== newVersion) {
    console.log(`Normalized version ${newVersion} to ${normalizedVersion}`);
}
const versionToUse = normalizedVersion;

const rootDir = path.resolve(__dirname, '..');

const files = [
    {
        path: path.join(rootDir, 'package.json'),
        regex: /"version":\s*"[^"]+"/,
        replacement: `"version": "${versionToUse}"`
    },
    {
        path: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
        regex: /"version":\s*"[^"]+"/,
        replacement: `"version": "${versionToUse}"`
    },
    {
        path: path.join(rootDir, 'src-tauri', 'Cargo.toml'),
        regex: /^version\s*=\s*"[^"]+"/m,
        replacement: `version = "${versionToUse}"`
    },
    {
        path: path.join(rootDir, 'src-tauri', 'Cargo.lock'),
        regex: /(name\s*=\s*"robot_runner"[\r\n]+\s*version\s*=\s*)"[^"]+"/,
        replacement: `$1"${versionToUse}"`
    },
    {
        path: path.join(rootDir, 'package-lock.json'),
        regex: /("name":\s*"robot_runner",\s*"version":\s*)"[^"]+"/,
        replacement: `$1"${versionToUse}"`
    },
    {
        path: path.join(rootDir, 'package-lock.json'),
        regex: /("":\s*\{\s*"name":\s*"robot_runner",\s*"version":\s*)"[^"]+"/,
        replacement: `$1"${versionToUse}"`
    },
    {
        path: path.join(rootDir, 'companion', 'app', 'build.gradle.kts'),
        regex: /versionCode\s*=\s*\d+/,
        replacement: `versionCode = ${versionCode}`
    },
    {
        path: path.join(rootDir, 'companion', 'app', 'build.gradle.kts'),
        regex: /versionName\s*=\s*"[^"]+"/,
        replacement: `versionName = "${versionToUse}"`
    }
];

// "-stableN" tags are stable releases and keep the MSI installer (MSI only accepts numeric versions, see wixVersion).
// Any other alphabetic tag (alpha, beta, rc...) is a pre-release and skips MSI.
const stableMatch = tag.match(/^-stable(\d*)$/i);
const isStableTag = !!stableMatch;
const hasAlphaTag = /[a-zA-Z]/.test(tag) && !isStableTag;
// Windows Installer only compares major.minor.build (the 4th field is ignored), so the stage rank is
// encoded into the build field for every MSI-enabled release: 3.0.0-stable1 -> 3.0.71, 3.0.0 -> 3.0.99.
const wixVersion = hasAlphaTag ? null : `${major}.${minor}.${patch * 100 + stageRank}`;

let hasError = false;

files.forEach(file => {
    try {
        if (fs.existsSync(file.path)) {
            let content = fs.readFileSync(file.path, 'utf8');

            // Special handling for tauri.conf.json to disable MSI for alpha tags
            if (file.path.endsWith('tauri.conf.json')) {
                const tauriConf = JSON.parse(content);
                tauriConf.version = versionToUse;
                if (hasAlphaTag) {
                    tauriConf.bundle.targets = ["nsis", "appimage", "deb", "dmg"];
                    console.log(`Note: Disabled MSI target in tauri.conf.json due to pre-release tag.`);
                } else {
                    tauriConf.bundle.targets = "all";
                }

                // Explicit, monotonic MSI version for every MSI-enabled release
                if (wixVersion) {
                    tauriConf.bundle.windows = tauriConf.bundle.windows || {};
                    tauriConf.bundle.windows.wix = { ...(tauriConf.bundle.windows.wix || {}), version: wixVersion };
                    console.log(`Note: MSI (WiX) version set to ${wixVersion}.`);
                } else if (tauriConf.bundle.windows?.wix?.version) {
                    delete tauriConf.bundle.windows.wix.version;
                    if (Object.keys(tauriConf.bundle.windows.wix).length === 0) delete tauriConf.bundle.windows.wix;
                    if (Object.keys(tauriConf.bundle.windows).length === 0) delete tauriConf.bundle.windows;
                }
                fs.writeFileSync(file.path, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
                console.log(`Updated ${path.basename(file.path)} to version ${newVersion}`);
            } else {
                if (file.regex.test(content)) {
                    content = content.replace(file.regex, file.replacement);
                    fs.writeFileSync(file.path, content, 'utf8');
                    console.log(`Updated ${path.basename(file.path)} to version ${newVersion}`);
                } else {
                    console.warn(`Warning: Could not find version pattern in ${path.basename(file.path)}`);
                }
            }
        } else {
            console.error(`Error: File not found: ${file.path}`);
            hasError = true;
        }
    } catch (e) {
        console.error(`Error updating ${file.path}:`, e);
        hasError = true;
    }
});

if (hasError) {
    process.exit(1);
} else {
    console.log(`\nSuccessfully updated project version to ${newVersion}`);
}
