
import { getVersion } from '@tauri-apps/api/app';
// import { fetch } from '@tauri-apps/plugin-http'; // Using native fetch for CORS support
import { gt } from 'semver';

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    body: string;
}

export interface UpdateInfo {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    url: string;
    notes: string;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
    let currentVersion = '0.0.0';
    try {
        currentVersion = await getVersion();
        console.log("[Updater] Current version:", currentVersion);
    } catch (e) {
        console.error("Failed to get app version:", e);
    }

    try {
        // Use Tauri's fetch to avoid CORS if possible, though GitHub API allows CORS
        const response = await fetch('https://api.github.com/repos/lucasdeeiroz/robot_runner/releases/latest', {
            method: 'GET',
            headers: {
                'User-Agent': 'RobotRunner-App'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API Error: ${response.statusText}`);
        }

        const data = await response.json() as GitHubRelease;
        const latestTag = data.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
        console.log("[Updater] Latest tag from GitHub:", data.tag_name, "Parsed:", latestTag);

        const available = gt(latestTag, currentVersion);
        console.log("[Updater] Update available?", available);

        return {
            available,
            currentVersion,
            latestVersion: latestTag,
            url: data.html_url,
            notes: data.body
        };
    } catch (e) {
        console.error("Failed to check updates:", e);
        return {
            available: false,
            currentVersion, // Return the actual version even if update check fails
            latestVersion: currentVersion,
            url: '',
            notes: `Error check: ${e instanceof Error ? e.message : String(e)}`
        };
    }
}
