import { ScreenMap } from '@/lib/types';
import { BaseDirectory, readTextFile, writeTextFile, remove, exists, mkdir, readDir } from '@tauri-apps/plugin-fs';

const getMapsDir = (profileId: string) => `maps/${profileId}/screens`;

// Helper to ensure directory exists
async function ensureDir(profileId: string) {
    try {
        const dir = getMapsDir(profileId);
        const dirExists = await exists(dir, { baseDir: BaseDirectory.AppLocalData });
        if (!dirExists) {
            await mkdir(dir, { baseDir: BaseDirectory.AppLocalData, recursive: true });
        }
    } catch (e) {
        console.error("Failed to ensure maps directory", e);
    }
}

export async function saveScreenMap(profileId: string, map: ScreenMap): Promise<void> {
    await ensureDir(profileId);
    const fileName = `${map.id}.json`;
    const content = JSON.stringify(map, null, 2);
    await writeTextFile(`${getMapsDir(profileId)}/${fileName}`, content, { baseDir: BaseDirectory.AppLocalData });
}

export async function loadScreenMap(profileId: string, id: string): Promise<ScreenMap> {
    const fileName = `${id}.json`;
    const content = await readTextFile(`${getMapsDir(profileId)}/${fileName}`, { baseDir: BaseDirectory.AppLocalData });
    return JSON.parse(content) as ScreenMap;
}

export async function listScreenMaps(profileId: string): Promise<ScreenMap[]> {
    await ensureDir(profileId);
    try {
        const dir = getMapsDir(profileId);
        const entries = await readDir(dir, { baseDir: BaseDirectory.AppLocalData });
        const maps: ScreenMap[] = [];

        for (const entry of entries) {
            if (entry.isFile && entry.name.endsWith('.json')) {
                try {
                    const content = await readTextFile(`${dir}/${entry.name}`, { baseDir: BaseDirectory.AppLocalData });
                    const map = JSON.parse(content) as ScreenMap;
                    maps.push(map);
                } catch (e) {
                    console.warn(`Failed to parse map file: ${entry.name}`, e);
                }
            }
        }
        return maps;
    } catch (e) {
        console.error("Failed to list screen maps", e);
        return [];
    }
}

export async function deleteScreenMap(profileId: string, id: string): Promise<void> {
    const fileName = `${id}.json`;
    await remove(`${getMapsDir(profileId)}/${fileName}`, { baseDir: BaseDirectory.AppLocalData });
}
