
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { gt } from 'semver';
import { platform } from '@tauri-apps/plugin-os';
import { tempDir, join } from '@tauri-apps/api/path';
import { writeFile } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { fetch } from '@tauri-apps/plugin-http';

interface GitHubAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    body: string;
    prerelease: boolean;
    assets: GitHubAsset[];
}

export interface UpdateAsset {
    name: string;
    url: string;
    size: number;
    isCompatible: boolean;
    type: 'installer' | 'portable' | 'other';
    /** URL of SHA256SUMS.txt in the same release (required to apply portable updates). */
    checksumsUrl?: string;
}

/** Thrown when a portable update fails integrity checks; `code` maps to an i18n key. */
export class UpdateIntegrityError extends Error {
    constructor(public code: 'checksum_mismatch' | 'checksum_missing' | 'invalid_asset', message: string) {
        super(message);
        this.name = 'UpdateIntegrityError';
    }
}

const SAFE_ASSET_NAME = /^Robot\.Runner_[A-Za-z0-9._-]+$/;

function isSafeAssetName(name: string): boolean {
    return SAFE_ASSET_NAME.test(name) && !name.includes('..');
}

export interface UpdateInfo {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    url: string;
    notes: string;
    assets: UpdateAsset[];
}


export async function checkForUpdates(channel: 'stable' | 'beta' | 'alpha' = 'stable'): Promise<UpdateInfo> {
    let currentVersion = '0.0.0';
    try {
        currentVersion = await getVersion();
    } catch (e) {
        console.error("Failed to get version:", e);
    }

    try {
        const currentPlatform = platform();
        let targetRelease: GitHubRelease | null = null;

        if (channel === 'stable') {
            const response = await fetch('https://api.github.com/repos/lucasdeeiroz/robot_runner/releases/latest', {
                method: 'GET',
                headers: { 'User-Agent': 'RobotRunner-App' }
            });
            if (!response.ok) throw new Error(`GitHub API Error: ${response.statusText}`);
            targetRelease = await response.json() as GitHubRelease;
        } else {
            const response = await fetch('https://api.github.com/repos/lucasdeeiroz/robot_runner/releases', {
                method: 'GET',
                headers: { 'User-Agent': 'RobotRunner-App' }
            });
            if (!response.ok) throw new Error(`GitHub API Error: ${response.statusText}`);
            const releases = await response.json() as GitHubRelease[];
            
            if (channel === 'alpha') {
                targetRelease = releases[0] || null;
            } else if (channel === 'beta') {
                targetRelease = releases.find(r => {
                    const tag = r.tag_name.toLowerCase();
                    return !tag.includes('-alpha') && !tag.includes('-dev');
                }) || null;
                if (!targetRelease) {
                    targetRelease = releases.find(r => !r.prerelease) || releases[0] || null;
                }
            }
        }

        if (!targetRelease) {
             throw new Error("No releases found");
        }

        const data = targetRelease;
        const latestTag = data.tag_name.replace(/^v/, ''); 

        const available = gt(latestTag, currentVersion);

        const checksumsAsset = data.assets.find(a => a.name === 'SHA256SUMS.txt');
        const checksumsUrl = checksumsAsset?.browser_download_url;

        // Map and filter assets
        const assets: UpdateAsset[] = data.assets.map(asset => {
            const name = asset.name.toLowerCase();
            let isCompatible = false;
            let type: 'installer' | 'portable' | 'other' = 'other';

            // Platform check
            if (currentPlatform === 'windows') {
                if (name.includes('windows') && (name.includes('x64') || name.includes('x86_64'))) {
                    isCompatible = true;
                    if (name.includes('setup.exe') || name.includes('.msi')) type = 'installer';
                    else if (name.includes('portable.exe') || name.includes('-portable.exe') || name.includes('portable')) type = 'portable';
                }
            } else if (currentPlatform === 'linux') {
                if (name.includes('linux') && (name.includes('amd64') || name.includes('x86_64'))) {
                    isCompatible = true;
                    if (name.includes('.deb') || name.includes('.rpm')) type = 'installer';
                    else if (name.includes('.appimage') || name.includes('portable')) type = 'portable';
                }
            } else if (currentPlatform === 'macos') {
                if (name.includes('macos') || name.includes('darwin')) {
                    isCompatible = true;
                    if (name.includes('.dmg')) type = 'installer';
                    else if (name.includes('.tar.gz') || name.includes('portable')) type = 'portable';
                }
            }

            return {
                name: asset.name,
                url: asset.browser_download_url,
                size: asset.size,
                isCompatible,
                type,
                checksumsUrl
            };
        }).filter(a => a.isCompatible);

        return {
            available,
            currentVersion,
            latestVersion: latestTag,
            url: data.html_url,
            notes: data.body,
            assets
        };
    } catch (e) {
        return {
            available: false,
            currentVersion,
            latestVersion: currentVersion,
            url: '',
            notes: `Error check: ${e instanceof Error ? e.message : String(e)}`,
            assets: []
        };
    }
}

export async function downloadAndInstall(asset: UpdateAsset, onProgress?: (p: number) => void): Promise<void> {
    try {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error("Failed to download update");

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Failed to get reader");

        let received = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (total > 0 && onProgress) {
                onProgress(Math.round((received / total) * 100));
            }
        }

        const data = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }

        if (asset.type === 'portable' && !isSafeAssetName(asset.name)) {
            throw new UpdateIntegrityError('invalid_asset', `Unexpected asset name: ${asset.name}`);
        }
        if (asset.type === 'portable' && !asset.checksumsUrl) {
            throw new UpdateIntegrityError('checksum_missing', 'SHA256SUMS.txt not found in release');
        }

        const temp = await tempDir();
        const safeName = asset.name.replace(/[\\/:]/g, '_');
        const filePath = await join(temp, safeName);

        await writeFile(filePath, data);

        if (asset.type === 'portable') {
            // The backend verifies SHA-256 against SHA256SUMS.txt and refuses to apply on mismatch.
            // Never fall back to opening an unverified binary.
            try {
                await invoke('apply_portable_update', {
                    tempDownloadPath: filePath,
                    assetName: asset.name,
                    checksumsUrl: asset.checksumsUrl
                });
            } catch (err) {
                const msg = String(err);
                if (msg.includes('UPDATE_CHECKSUM_MISMATCH')) {
                    throw new UpdateIntegrityError('checksum_mismatch', msg);
                }
                if (msg.includes('UPDATE_CHECKSUM_MISSING')) {
                    throw new UpdateIntegrityError('checksum_missing', msg);
                }
                if (msg.includes('UPDATE_CHECKSUM_INVALID_ASSET')) {
                    throw new UpdateIntegrityError('invalid_asset', msg);
                }
                throw err;
            }
        } else {
            // Open the installer
            await openPath(filePath);
        }
    } catch (e) {
        console.error("Update download failed:", e);
        throw e;
    }
}
