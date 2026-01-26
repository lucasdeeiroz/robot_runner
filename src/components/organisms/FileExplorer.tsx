import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Folder, File, ChevronRight, CornerLeftUp, Loader2 } from "lucide-react";
import clsx from "clsx";

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
import { WarningModal } from "@/components/organisms/WarningModal";
import { feedback } from "@/lib/feedback";

export function FileExplorer({ initialPath = ".", onSelect, onCancel, selectionMode = 'file', title: _title, onSelectionChange, allowHideFooter = false }: FileExplorerProps) {
    const { t } = useTranslation();
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
    const [warningModal, setWarningModal] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: '' });

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
            feedback.toast.error("file_explorer.list_error", e);
            setError(typeof e === 'string' ? e : t('file_explorer.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
    };

    const handleUp = async () => {
        const isWindows = currentPath.includes('\\');
        const separator = isWindows ? '\\' : '/';

        if (currentPath === '.' || currentPath === '/' || currentPath.endsWith(':\\')) {
            return;
        }

        const parts = currentPath.split(separator).filter(Boolean);
        parts.pop();
        const parent = parts.join(separator) || (isWindows ? currentPath.split(separator)[0] /* Drive root? */ : '/');

        if (parent === currentPath) return; // Can't go up
        setCurrentPath(parent);
    };

    const handleEntryClick = (entry: FileEntry) => {
        if (entry.is_dir) {
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
            if (selectionMode === 'directory') {
                onSelect(currentPath);
            }
            return;
        }

        if (selectionMode === 'directory') {
            if (selectedEntry.is_dir) {
                onSelect(selectedEntry.path);
            } else {
                setWarningModal({
                    isOpen: true,
                    message: t('file_explorer.select_folder')
                });
            }
        } else {
            // File mode
            if (!selectedEntry.is_dir) {
                onSelect(selectedEntry.path);
            } else {
                handleNavigate(selectedEntry.path);
            }
        }
    };

    return (
        <div className="flex flex-col h-full">
            <WarningModal
                isOpen={warningModal.isOpen}
                onClose={() => setWarningModal(prev => ({ ...prev, isOpen: false }))}
                title={t('common.attention', "Attention")}
                description={warningModal.message}
            />
            {/* Header / Breadcrumb */}
            <div className="flex items-center gap-2 mb-2 p-2 bg-transparent backdrop-blur-md rounded-lg border border-outline-variant/30 shrink-0">
                <button
                    onClick={handleUp}
                    className="p-1 hover:bg-surface-variant/50 rounded transition-colors text-on-surface-variant/80"
                    title={t('file_explorer.up')}
                >
                    <CornerLeftUp size={18} />
                </button>
                <div className="flex-1 font-mono text-sm truncate px-2 text-on-surface/80">
                    {currentPath}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto border border-outline-variant/30 rounded-lg bg-transparent backdrop-blur-md p-1 min-h-0">
                {loading && (
                    <div className="flex flex-col items-center justify-center h-full text-on-surface/80">
                        <Loader2 size={32} className="animate-spin mb-2" />
                        <span className="text-xs">{t('file_explorer.loading')}</span>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center h-full text-error">
                        <span className="text-sm">{error}</span>
                        <button onClick={() => loadDirectory(".")} className="mt-4 text-xs underline">
                            {t('file_explorer.reset')}
                        </button>
                    </div>
                )}

                {!loading && !error && (
                    <div className="flex flex-col gap-0.5">
                        {entries.map(entry => {
                            const isSelected = selectedEntry?.path === entry.path;
                            return (
                                <div
                                    key={entry.path}
                                    onClick={() => handleEntryClick(entry)}
                                    onDoubleClick={() => entry.is_dir ? handleNavigate(entry.path) : onSelect(entry.path)}
                                    className={clsx(
                                        "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm select-none transition-colors",
                                        isSelected
                                            ? "bg-secondary-container text-on-secondary-container ring-1 ring-secondary/20"
                                            : "hover:bg-surface-variant/30 text-on-surface/80"
                                    )}
                                >
                                    {entry.is_dir ? (
                                        <Folder size={18} className="text-warning-container fill-warning-container/50 shrink-0" />
                                    ) : (
                                        <File size={18} className="text-on-surface/80 shrink-0" />
                                    )}
                                    <span className="truncate flex-1">{entry.name}</span>
                                    {entry.is_dir && <ChevronRight size={14} className="text-on-surface/80 opacity-50" />}
                                </div>
                            );
                        })}
                        {entries.length === 0 && (
                            <div className="text-center text-on-surface/80 py-8 text-xs italic">
                                {t('file_explorer.empty')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            {!allowHideFooter && (
                <div className="flex items-center justify-end gap-3 mt-4 pt-2 border-t border-outline-variant/30 shrink-0">
                    <div className="flex-1 text-xs text-on-surface/80 truncate">
                        {selectedEntry ? selectedEntry.name : selectionMode === 'directory' ? t('file_explorer.current') : t('file_explorer.no_selection')}
                    </div>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant/80 hover:bg-surface-variant/30 transition-colors"
                    >
                        {t('file_explorer.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedEntry && selectionMode === 'file'}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {selectionMode === 'directory' ? t('file_explorer.select_folder') : t('file_explorer.select_file')}
                    </button>
                </div>
            )}
        </div>
    );
}
