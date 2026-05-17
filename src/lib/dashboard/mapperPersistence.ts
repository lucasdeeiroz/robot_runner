import { ScreenMap } from '@/lib/types';
import { BaseDirectory, readTextFile, writeTextFile, remove, exists, mkdir, readDir } from '@tauri-apps/plugin-fs';

const getMapsDir = (profileId: string) => `maps/${profileId}/screens`;

const getPathAndOptions = (profileId: string, customDir?: string) => {
    if (customDir && customDir.trim() !== '') {
        return {
            dir: customDir,
            options: {}
        };
    } else {
        return {
            dir: getMapsDir(profileId),
            options: { baseDir: BaseDirectory.AppLocalData }
        };
    }
};

// Helper to ensure directory exists
async function ensureDir(profileId: string, customDir?: string) {
    try {
        const { dir, options } = getPathAndOptions(profileId, customDir);
        const dirExists = await exists(dir, options);
        if (!dirExists) {
            await mkdir(dir, { ...options, recursive: true });
        }
    } catch (e) {
        console.error("Failed to ensure maps directory", e);
    }
}

export async function saveScreenMap(profileId: string, map: ScreenMap, customDir?: string): Promise<void> {
    await ensureDir(profileId, customDir);
    const { dir, options } = getPathAndOptions(profileId, customDir);
    const fileName = `${map.id}.json`;
    const content = JSON.stringify(map, null, 2);
    await writeTextFile(`${dir}/${fileName}`, content, options);
}

export async function loadScreenMap(profileId: string, id: string, customDir?: string): Promise<ScreenMap> {
    const { dir, options } = getPathAndOptions(profileId, customDir);
    const fileName = `${id}.json`;
    const content = await readTextFile(`${dir}/${fileName}`, options);
    return JSON.parse(content) as ScreenMap;
}

export async function listScreenMaps(profileId: string, customDir?: string): Promise<ScreenMap[]> {
    await ensureDir(profileId, customDir);
    try {
        const { dir, options } = getPathAndOptions(profileId, customDir);
        const entries = await readDir(dir, options);
        const maps: ScreenMap[] = [];

        for (const entry of entries) {
            if (entry.isFile && entry.name.endsWith('.json') && entry.name !== 'flowchart_layout.json') {
                const path = `${dir}/${entry.name}`;
                try {
                    const content = await readTextFile(path, options);
                    try {
                        const map = JSON.parse(content) as ScreenMap;
                        maps.push(map);
                    } catch (parseError) {
                        console.error(`CRITICAL: Failed to parse map file "${entry.name}". The JSON syntax is likely invalid.`, parseError);
                        // Attempt a naive repair for unescaped quotes in XPath-like strings if it's a simple case
                        // (This is a safety net for the reported issue)
                        try {
                            // This regex tries to find "id": "//...[@attr="val"]" and escape the inner quotes
                            // It's very restricted to avoid breaking valid JSON.
                            const repaired = content.replace(/"id":\s*"(\/\/.*?)\[(.*?)\]"/g, (_match, prefix, predicates) => {
                                const escapedPredicates = predicates.replace(/"/g, '\\"');
                                return `"id": "${prefix}[${escapedPredicates}]"`;
                            });
                            const map = JSON.parse(repaired) as ScreenMap;
                            maps.push(map);
                            console.info(`Successfully repaired and loaded "${entry.name}" in memory.`);
                        } catch (repairError) {
                            console.error(`Repair failed for "${entry.name}". Please fix the JSON manually.`, repairError);
                        }
                    }
                } catch (readError) {
                    console.error(`Failed to read file ${entry.name}`, readError);
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
    const { dir, options } = getPathAndOptions(profileId, customDir);
    const fileName = `${id}.json`;
    await remove(`${dir}/${fileName}`, options);
}

// --- Flowchart Layout Persistence ---
import { FlowchartLayout } from '@/lib/types';

export async function saveFlowchartLayout(profileId: string, layout: FlowchartLayout, customDir?: string): Promise<void> {
    await ensureDir(profileId, customDir);
    const { dir, options } = getPathAndOptions(profileId, customDir);
    const fileName = 'flowchart_layout.json';
    const content = JSON.stringify(layout, null, 2);
    await writeTextFile(`${dir}/${fileName}`, content, options);
}

export async function loadFlowchartLayout(profileId: string, customDir?: string): Promise<FlowchartLayout | null> {
    try {
        await ensureDir(profileId, customDir);
        const { dir, options } = getPathAndOptions(profileId, customDir);
        const fileName = 'flowchart_layout.json';
        const path = `${dir}/${fileName}`;
        const layoutExists = await exists(path, options);

        if (!layoutExists) return null;

        const content = await readTextFile(path, options);
        return JSON.parse(content) as FlowchartLayout;
    } catch (e) {
        console.warn("Failed to load flowchart layout", e);
        return null;
    }
}

export async function deleteFlowchartLayout(profileId: string, customDir?: string): Promise<void> {
    try {
        const { dir, options } = getPathAndOptions(profileId, customDir);
        const fileName = 'flowchart_layout.json';
        const path = `${dir}/${fileName}`;
        const layoutExists = await exists(path, options);
        if (layoutExists) {
            await remove(path, options);
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
    const layout = await loadFlowchartLayout(profileId, customDir); // Still load it in case migration hasn't happened

    const data: MapperExportData = {
        screens,
        layout,
        version: "2.0" // Decentralized version
    };

    return JSON.stringify(data, null, 2);
}

export async function importMapperData(profileId: string, jsonContent: string, customDir?: string): Promise<void> {
    try {
        const data = JSON.parse(jsonContent) as MapperExportData;

        if (!Array.isArray(data.screens)) {
            throw new Error("Invalid import data: 'screens' is not an array");
        }

        // 1. Save all screens
        // Note: New screens already have 'layout' and 'navigation' (via navigates_to)
        for (const screen of data.screens) {
            await saveScreenMap(profileId, screen, customDir);
        }

        // 2. Save legacy layout if present
        // This allows older exports to be imported, where FlowchartModal will then trigger migration
        if (data.layout) {
            await saveFlowchartLayout(profileId, data.layout, customDir);
        }

    } catch (e) {
        console.error("Failed to import mapper data", e);
        throw e;
    }
}

export async function migrateScreenMaps(profileId: string, oldDir?: string, newDir?: string): Promise<void> {
    const oldPathInfo = getPathAndOptions(profileId, oldDir);
    const newPathInfo = getPathAndOptions(profileId, newDir);

    // If both resolve to the same path, do nothing
    if (oldPathInfo.dir === newPathInfo.dir && oldPathInfo.options.baseDir === newPathInfo.options.baseDir) {
        return;
    }

    try {
        if (await exists(oldPathInfo.dir, oldPathInfo.options)) {
            // Ensure destination exists
            await ensureDir(profileId, newDir);

            const entries = await readDir(oldPathInfo.dir, oldPathInfo.options);
            for (const entry of entries) {
                if (entry.isFile && entry.name.endsWith('.json')) {
                    const sourcePath = `${oldPathInfo.dir}/${entry.name}`;
                    const destPath = `${newPathInfo.dir}/${entry.name}`;

                    if (await exists(destPath, newPathInfo.options)) {
                        throw new Error(`Destination already contains mapping file: ${entry.name}`);
                    }

                    try {
                        const content = await readTextFile(sourcePath, oldPathInfo.options);
                        await writeTextFile(destPath, content, newPathInfo.options);
                        await remove(sourcePath, oldPathInfo.options);
                    } catch (fileError) {
                        console.error(`Failed to migrate file ${entry.name}`, fileError);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to migrate screen maps", e);
        throw e;
    }
}
