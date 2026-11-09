// Shared release metadata used by the CI scripts (prepare_release.mjs / collect_release_assets.mjs).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Same format accepted by scripts/bump_version.js, prefixed with "v"
export const TAG_REGEX = /^v(\d+\.\d+\.\d+(?:-[A-Za-z0-9]+)?)$/;

// Mirrors the update channels in src/lib/updater.ts
export function classifyTag(tag) {
    const lower = tag.toLowerCase();
    if (/-(alpha|dev)/.test(lower)) return { channel: 'alpha', prerelease: true };
    if (/-(beta|rc)/.test(lower)) return { channel: 'beta', prerelease: true };
    return { channel: 'stable', prerelease: false };
}

export function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8'));
}

// Bundle targets enabled in tauri.conf.json ("all" or an explicit list)
export function readBundleTargets() {
    const targets = readJson('src-tauri/tauri.conf.json').bundle?.targets ?? 'all';
    const has = (target) => targets === 'all' || (Array.isArray(targets) && targets.includes(target));
    return { msi: has('msi'), rpm: has('rpm') };
}

const BUNDLE = 'src-tauri/target/release/bundle';
const MAC_BUNDLE = 'src-tauri/target/universal-apple-darwin/release/bundle';

/**
 * Every asset published in a release.
 * source.dir + source.ext -> first file with that extension in the directory
 * source.file             -> exact file
 * source.tarDir + entry   -> tar.gz of a directory entry (macOS .app)
 */
export function getExpectedAssets(version, targets = readBundleTargets()) {
    const name = (suffix) => `Robot.Runner_${version}_${suffix}`;
    const assets = [
        { platform: 'windows', label: 'Installer (recommended)', name: name('windows_x64-setup.exe'), source: { dir: `${BUNDLE}/nsis`, ext: '-setup.exe' } },
        { platform: 'windows', label: 'MSI installer', name: name('windows_x64_en-US.msi'), source: { dir: `${BUNDLE}/msi`, ext: '.msi' }, enabled: targets.msi },
        { platform: 'windows', label: 'Portable', name: name('windows_x64-portable.exe'), source: { file: 'src-tauri/target/release/robot_runner.exe' } },
        { platform: 'macos', label: 'Disk image (recommended)', name: name('macos_universal.dmg'), source: { dir: `${MAC_BUNDLE}/dmg`, ext: '.dmg' } },
        { platform: 'macos', label: 'App archive', name: name('macos_universal.app.tar.gz'), source: { tarDir: `${MAC_BUNDLE}/macos`, entry: 'Robot Runner.app' } },
        { platform: 'linux', label: 'AppImage (portable)', name: name('linux_amd64.AppImage'), source: { dir: `${BUNDLE}/appimage`, ext: '.AppImage' } },
        { platform: 'linux', label: 'Debian / Ubuntu', name: name('linux_amd64.deb'), source: { dir: `${BUNDLE}/deb`, ext: '.deb' } },
        { platform: 'linux', label: 'Fedora / RHEL', name: name('linux_x86_64.rpm'), source: { dir: `${BUNDLE}/rpm`, ext: '.rpm' }, enabled: targets.rpm },
        { platform: 'android', label: 'Companion app', name: 'companion.apk', source: { dir: 'companion/app/build/outputs/apk/release', ext: '.apk' } },
    ];
    return assets.filter(asset => asset.enabled !== false);
}

export const PLATFORM_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };
