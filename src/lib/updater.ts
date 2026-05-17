
import { getVersion } from '@tauri-apps/api/app';
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
            
            targetRelease = releases.find(r => r.tag_name.toLowerCase().includes(`-${channel}`)) || null;
            if (!targetRelease) {
                targetRelease = releases.find(r => !r.prerelease) || releases[0] || null;
            }
        }

        if (!targetRelease) {
             throw new Error("No releases found");
        }

        const data = targetRelease;
        const latestTag = data.tag_name.replace(/^v/, ''); 

        const available = gt(latestTag, currentVersion);

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
                    else if (name.includes('portable.exe')) type = 'portable';
                }
            } else if (currentPlatform === 'linux') {
                if (name.includes('linux') && (name.includes('amd64') || name.includes('x86_64'))) {
                    isCompatible = true;
                    if (name.includes('.deb') || name.includes('.rpm')) type = 'installer';
                    else if (name.includes('.appimage')) type = 'portable';
                }
            } else if (currentPlatform === 'macos') {
                if (name.includes('macos') || name.includes('darwin')) {
                    isCompatible = true;
                    if (name.includes('.dmg')) type = 'installer';
                    else if (name.includes('.tar.gz')) type = 'portable';
                }
            }

            return {
                name: asset.name,
                url: asset.browser_download_url,
                size: asset.size,
                isCompatible,
                type
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

        const temp = await tempDir();
        const filePath = await join(temp, asset.name);

        await writeFile(filePath, data);

        // Open the installer
        await openPath(filePath);
    } catch (e) {
        console.error("Update download failed:", e);
        throw e;
    }
}
