import { ScreenMap, FlowchartLayout } from '@/lib/types';
import { invoke } from '@tauri-apps/api/core';
import { appLocalDataDir, join } from '@tauri-apps/api/path';

const getMapsDir = async (profileId: string) => {
    const localData = await appLocalDataDir();
    return await join(localData, 'maps', profileId, 'screens');
};

const resolveDir = async (profileId: string, customDir?: string) => {
    if (customDir && customDir.trim() !== '') {
        return customDir;
    } else {
        return await getMapsDir(profileId);
    }
};

// Helper to ensure directory exists
async function ensureDir(profileId: string, customDir?: string) {
    try {
        const dir = await resolveDir(profileId, customDir);
        const dirExists = await invoke<boolean>('fs_exists', { path: dir });
        if (!dirExists) {
            await invoke('fs_mkdir', { path: dir });
        }
    } catch (e) {
        console.error("Failed to ensure maps directory", e);
    }
}

export async function saveScreenMap(profileId: string, map: ScreenMap, customDir?: string): Promise<void> {
    await ensureDir(profileId, customDir);
    const dir = await resolveDir(profileId, customDir);
    const fileName = `${map.id}.json`;
    const content = JSON.stringify(map, null, 2);
    await invoke('fs_write_text_file', { path: `${dir}/${fileName}`, content });
}

export async function loadScreenMap(profileId: string, id: string, customDir?: string): Promise<ScreenMap> {
    const dir = await resolveDir(profileId, customDir);
    const fileName = `${id}.json`;
    const content = await invoke<string>('fs_read_text_file', { path: `${dir}/${fileName}` });
    return JSON.parse(content) as ScreenMap;
}

export async function listScreenMaps(profileId: string, customDir?: string): Promise<ScreenMap[]> {
    await ensureDir(profileId, customDir);
    try {
        const dir = await resolveDir(profileId, customDir);
        const fileNames = await invoke<string[]>('fs_read_dir_names', { path: dir });
        const maps: ScreenMap[] = [];

        for (const fileName of fileNames) {
            if (fileName.endsWith('.json') && fileName !== 'flowchart_layout.json') {
                const path = `${dir}/${fileName}`;
                try {
                    const content = await invoke<string>('fs_read_text_file', { path });
                    try {
                        const map = JSON.parse(content) as ScreenMap;
                        maps.push(map);
                    } catch (parseError) {
                        console.error(`CRITICAL: Failed to parse map file "${fileName}". The JSON syntax is likely invalid.`, parseError);
                        // Attempt a naive repair for unescaped quotes in XPath-like strings if it's a simple case
                        try {
                            const repaired = content.replace(/"id":\s*"(\/\/.*?)\[(.*?)\]"/g, (_match, prefix, predicates) => {
                                const escapedPredicates = predicates.replace(/"/g, '\\"');
                                return `"id": "${prefix}[${escapedPredicates}]"`;
                            });
                            const map = JSON.parse(repaired) as ScreenMap;
                            maps.push(map);
                            console.info(`Successfully repaired and loaded "${fileName}" in memory.`);
                        } catch (repairError) {
                            console.error(`Repair failed for "${fileName}". Please fix the JSON manually.`, repairError);
                        }
                    }
                } catch (readError) {
                    console.error(`Failed to read file ${fileName}`, readError);
                }
            }
        }
        return maps;
    } catch (e) {
        console.error("Failed to list screen maps", e);
        return [];
    }
}

export async function deleteScreenMap(profileId: string, id: string, customDir?: string): Promise<void> {
    const dir = await resolveDir(profileId, customDir);
    const fileName = `${id}.json`;
    await invoke('fs_remove_file', { path: `${dir}/${fileName}` });
}

export async function saveFlowchartLayout(profileId: string, layout: FlowchartLayout, customDir?: string): Promise<void> {
    await ensureDir(profileId, customDir);
    const dir = await resolveDir(profileId, customDir);
    const fileName = 'flowchart_layout.json';
    const content = JSON.stringify(layout, null, 2);
    await invoke('fs_write_text_file', { path: `${dir}/${fileName}`, content });
}

export async function loadFlowchartLayout(profileId: string, customDir?: string): Promise<FlowchartLayout | null> {
    try {
        await ensureDir(profileId, customDir);
        const dir = await resolveDir(profileId, customDir);
        const fileName = 'flowchart_layout.json';
        const path = `${dir}/${fileName}`;
        const layoutExists = await invoke<boolean>('fs_exists', { path });

        if (!layoutExists) return null;

        const content = await invoke<string>('fs_read_text_file', { path });
        return JSON.parse(content) as FlowchartLayout;
    } catch (e) {
        console.warn("Failed to load flowchart layout", e);
        return null;
    }
}

export async function deleteFlowchartLayout(profileId: string, customDir?: string): Promise<void> {
    try {
        const dir = await resolveDir(profileId, customDir);
        const fileName = 'flowchart_layout.json';
        const path = `${dir}/${fileName}`;
        const layoutExists = await invoke<boolean>('fs_exists', { path });
        if (layoutExists) {
            await invoke('fs_remove_file', { path });
        }
    } catch (e) {
        console.error("Failed to delete flowchart layout", e);
    }
}

// --- Export / Import ---
export interface MapperExportData {
    screens: ScreenMap[];
    layout: FlowchartLayout | null;
    version?: string; // Add a version for future-proofing
}

export async function exportMapperData(profileId: string, customDir?: string): Promise<string> {
    const screens = await listScreenMaps(profileId, customDir);
    const layout = await loadFlowchartLayout(profileId, customDir);

    const data: MapperExportData = {
        screens,
        layout,
        version: "2.0"
    };

    return JSON.stringify(data, null, 2);
}

export async function importMapperData(profileId: string, jsonContent: string, customDir?: string): Promise<void> {
    try {
        const data = JSON.parse(jsonContent) as MapperExportData;

        if (!Array.isArray(data.screens)) {
            throw new Error("Invalid import data: 'screens' is not an array");
        }

        for (const screen of data.screens) {
            await saveScreenMap(profileId, screen, customDir);
        }

        if (data.layout) {
            await saveFlowchartLayout(profileId, data.layout, customDir);
        }

    } catch (e) {
        console.error("Failed to import mapper data", e);
        throw e;
    }
}

export async function migrateScreenMaps(profileId: string, oldDir?: string, newDir?: string): Promise<void> {
    const oldDirResolved = await resolveDir(profileId, oldDir);
    const newDirResolved = await resolveDir(profileId, newDir);

    if (oldDirResolved === newDirResolved) {
        return;
    }

    try {
        const oldExists = await invoke<boolean>('fs_exists', { path: oldDirResolved });
        if (oldExists) {
            await ensureDir(profileId, newDir);

            const fileNames = await invoke<string[]>('fs_read_dir_names', { path: oldDirResolved });
            for (const fileName of fileNames) {
                if (fileName.endsWith('.json')) {
                    const sourcePath = `${oldDirResolved}/${fileName}`;
                    const destPath = `${newDirResolved}/${fileName}`;

                    const destExists = await invoke<boolean>('fs_exists', { path: destPath });
                    if (destExists) {
                        throw new Error(`Destination already contains mapping file: ${fileName}`);
                    }

                    try {
                        const content = await invoke<string>('fs_read_text_file', { path: sourcePath });
                        await invoke('fs_write_text_file', { path: destPath, content });
                        await invoke('fs_remove_file', { path: sourcePath });
                    } catch (fileError) {
                        console.error(`Failed to migrate file ${fileName}`, fileError);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to migrate screen maps", e);
        throw e;
    }
}
