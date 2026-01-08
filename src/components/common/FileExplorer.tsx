import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Folder, File, ChevronRight, CornerLeftUp, Loader2 } from "lucide-react";
import clsx from "clsx";
// Actually, for file explorer, simpler to just use backend for path manipulation OR basic string splitting if we assume valid paths.
// Let's rely on backend `list_directory` returning full paths, and we just modify string for "Up".

interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
}

interface FileExplorerProps {
    initialPath?: string;
    onSelect: (path: string) => void;
    onCancel: () => void;
    selectionMode?: 'file' | 'directory';
    title?: string;
    onSelectionChange?: (entry: FileEntry | null) => void;
    allowHideFooter?: boolean;
}

import { useTranslation } from "react-i18next";

export function FileExplorer({ initialPath = ".", onSelect, onCancel, selectionMode = 'file', title: _title, onSelectionChange, allowHideFooter = false }: FileExplorerProps) {
    const { t } = useTranslation();
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);

    useEffect(() => {
        loadDirectory(currentPath);
    }, [currentPath]);

    // React to props change (e.g. mode switch or settings load)
    useEffect(() => {
        if (initialPath && initialPath !== currentPath) {
            setCurrentPath(initialPath);
        }
    }, [initialPath]);

    const loadDirectory = async (path: string) => {
        setLoading(true);
        setError(null);
        setSelectedEntry(null); // Reset selection on nav
        try {
            const list = await invoke<FileEntry[]>('list_directory', { path });
            setEntries(list);
        } catch (e) {
            console.error("Failed to list directory:", e);
            setError(typeof e === 'string' ? e : t('file_explorer.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
    };

    const handleUp = async () => {
        // Simple "Up" logic: verify if we can use '..'
        // Better: specific backend command `get_parent`? 
        // Or just navigate to ".." and let backend resolve it.
        // If currentPath is ".", ".." works.
        // If currentPath is "C:/Foo/Bar", "C:/Foo/Bar/.." works.
        // Backend `list_directory` usually resolves canonical paths?
        // Let's try appending "/.." or just simply splitting string.

        // Robust way: Ask backend to resolve? 
        // Existing `list_directory` implementation calls `fs::read_dir(path)`.
        // If we pass `path + "/.."`, `fs::read_dir` usually handles it (on Windows/Linux).
        // Let's rely on backend handling ".."

        // Wait, if we keep appending "/..", path gets ugly.
        // It's better if `list_directory` returned the `canonical` path or `parent`.
        // For now, let's just pop the last segment if possible, or use ".." 

        // Quick dirty fix: String manipulation for visual path.
        // If path contains separators, remove last part.

        // Only safe cross-platform way without extra backend cmds:
        // Pass ".." relative to current if we strictly trust backend.
        // But for UI "Address Bar", we want the real path.
        // Let's assume the user starts with a valid absolute path or "."

        // Let's try simple string logic for now, if it fails, we might need a `resolve_path` command.
        // Windows uses `\`, Linux `/`.
        const isWindows = currentPath.includes('\\');
        const separator = isWindows ? '\\' : '/';

        if (currentPath === '.' || currentPath === '/' || currentPath.endsWith(':\\')) {
            // Already at root-ish or relative root.
            // Maybe can't go up from "." in this simple view without context.
            return;
        }

        const parts = currentPath.split(separator).filter(Boolean);
        parts.pop();
        const parent = parts.join(separator) || (isWindows ? currentPath.split(separator)[0] /* Drive root? */ : '/');

        // If empty string resulted (e.g. from "C:/"), default to Drive root or just stay?
        // Actually best way: use `tauri-plugin-fs` or just implement `get_parent` in rust?
        // Let's implement `up` in frontend via naive string split for now.

        if (parent === currentPath) return; // Can't go up
        setCurrentPath(parent);
    };

    const handleEntryClick = (entry: FileEntry) => {
        if (entry.is_dir) {
            // Setup double click? Or single click select, double click nav?
            // Let's do: Single click selects, Double click navigates.
            if (selectedEntry?.path === entry.path) {
                // Double click (simulated by second click logic)
                handleNavigate(entry.path);
            } else {
                setSelectedEntry(entry);
                if (onSelectionChange) onSelectionChange(entry);
            }
        } else {
            setSelectedEntry(entry);
            if (onSelectionChange) onSelectionChange(entry);
        }
    };

    const handleConfirm = () => {
        if (!selectedEntry) {
            // If mode is directory and nothing selected, maybe select current directory?
            if (selectionMode === 'directory') {
                onSelect(currentPath);
            }
            return;
        }

        if (selectionMode === 'directory') {
            if (selectedEntry.is_dir) {
                onSelect(selectedEntry.path);
            } else {
                // Should not happen if filtered, but just in case
                alert(t('file_explorer.select_folder'));
            }
        } else {
            // File mode
            if (!selectedEntry.is_dir) {
                onSelect(selectedEntry.path);
            } else {
                // If user selected a dir in file mode, open it?
                handleNavigate(selectedEntry.path);
            }
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header / Breadcrumb */}
            <div className="flex items-center gap-2 mb-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 shrink-0">
                <button
                    onClick={handleUp}
                    className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-500"
                    title={t('file_explorer.up')}
                >
                    <CornerLeftUp size={18} />
                </button>
                <div className="flex-1 font-mono text-sm truncate px-2 text-zinc-700 dark:text-zinc-300">
                    {currentPath}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 p-1 min-h-0">
                {loading && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                        <Loader2 size={32} className="animate-spin mb-2" />
                        <span className="text-xs">{t('file_explorer.loading')}</span>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center h-full text-red-500">
                        <span className="text-sm">{error}</span>
                        <button onClick={() => loadDirectory(".")} className="mt-4 text-xs underline">
                            {t('file_explorer.reset')}
                        </button>
                    </div>
                )}

                {!loading && !error && (
                    <div className="flex flex-col gap-0.5">
                        {entries.map(entry => (
                            <div
                                key={entry.path}
                                onClick={() => handleEntryClick(entry)}
                                onDoubleClick={() => entry.is_dir ? handleNavigate(entry.path) : onSelect(entry.path)}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm select-none transition-colors",
                                    selectedEntry?.path === entry.path
                                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 ring-1 ring-blue-500/20"
                                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                                )}
                            >
                                {entry.is_dir ? (
                                    <Folder size={18} className="text-yellow-500 fill-yellow-500/20 shrink-0" />
                                ) : (
                                    <File size={18} className="text-zinc-400 shrink-0" />
                                )}
                                <span className="truncate flex-1">{entry.name}</span>
                                {entry.is_dir && <ChevronRight size={14} className="text-zinc-300 opacity-50" />}
                            </div>
                        ))}
                        {entries.length === 0 && (
                            <div className="text-center text-zinc-400 py-8 text-xs italic">
                                {t('file_explorer.empty')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            {!allowHideFooter && (
                <div className="flex items-center justify-end gap-3 mt-4 pt-2 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
                    <div className="flex-1 text-xs text-zinc-400 truncate">
                        {selectedEntry ? selectedEntry.name : selectionMode === 'directory' ? t('file_explorer.current') : t('file_explorer.no_selection')}
                    </div>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        {t('file_explorer.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedEntry && selectionMode === 'file'}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {selectionMode === 'directory' ? t('file_explorer.select_folder') : t('file_explorer.select_file')}
                    </button>
                </div>
            )}
        </div>
    );
}
