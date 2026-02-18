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
            if (entry.isFile && entry.name.endsWith('.json') && entry.name !== 'flowchart_layout.json') {
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


// --- Flowchart Layout Persistence ---

import { FlowchartLayout } from '@/lib/types';

export async function saveFlowchartLayout(profileId: string, layout: FlowchartLayout): Promise<void> {
    await ensureDir(profileId);
    const fileName = 'flowchart_layout.json';
    const content = JSON.stringify(layout, null, 2);
    await writeTextFile(`${getMapsDir(profileId)}/${fileName}`, content, { baseDir: BaseDirectory.AppLocalData });
}

export async function loadFlowchartLayout(profileId: string): Promise<FlowchartLayout | null> {
    try {
        await ensureDir(profileId);
        const fileName = 'flowchart_layout.json';
        const path = `${getMapsDir(profileId)}/${fileName}`;
        const layoutExists = await exists(path, { baseDir: BaseDirectory.AppLocalData });

        if (!layoutExists) return null;

        const content = await readTextFile(path, { baseDir: BaseDirectory.AppLocalData });
        return JSON.parse(content) as FlowchartLayout;
    } catch (e) {
        console.warn("Failed to load flowchart layout", e);
        return null;
    }
}

// --- Export / Import ---

export interface MapperExportData {
    screens: ScreenMap[];
    layout: FlowchartLayout | null;
}

export async function exportMapperData(profileId: string): Promise<string> {
    const screens = await listScreenMaps(profileId);
    const layout = await loadFlowchartLayout(profileId);

    const data: MapperExportData = {
        screens,
        layout
    };

    return JSON.stringify(data, null, 2);
}

export async function importMapperData(profileId: string, jsonContent: string): Promise<void> {
    try {
        const data = JSON.parse(jsonContent) as MapperExportData;

        if (!Array.isArray(data.screens)) {
            throw new Error("Invalid import data: 'screens' is not an array");
        }

        // Save all screens
        for (const screen of data.screens) {
            await saveScreenMap(profileId, screen);
        }

        // Save layout if present
        if (data.layout) {
            await saveFlowchartLayout(profileId, data.layout);
        }

    } catch (e) {
        console.error("Failed to import mapper data", e);
        throw e;
    }
}
