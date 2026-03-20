import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ScreenMap } from "./types"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function groupScreensByTags(maps: ScreenMap[], noTagsLabel: string): [string, ScreenMap[]][] {
    const grouped = maps.reduce((acc, map) => {
        const tags = map.tags && map.tags.length > 0 ? map.tags : [noTagsLabel];
        tags.forEach(tag => {
            if (!acc[tag]) acc[tag] = [];
            acc[tag].push(map);
        });
        return acc;
    }, {} as Record<string, ScreenMap[]>);

    return Object.entries(grouped).sort(([a], [b]) => {
        if (a === noTagsLabel) return 1;
        if (b === noTagsLabel) return -1;
        return a.localeCompare(b);
    });
}
export function decodeHtml(text: string): string {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        return doc.documentElement.textContent || text;
    } catch (e) {
        return text;
    }
}
