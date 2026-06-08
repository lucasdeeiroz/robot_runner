import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, File as FileIcon, ChevronRight, CornerLeftUp, FileText, FileCode, FolderSearch, Settings } from "lucide-react";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { WarningModal } from "@/components/organisms/WarningModal";
import { feedback } from "@/lib/feedback";
import { useSelection } from "@/lib/selectionStore";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Modal } from "@/components/organisms/Modal";

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
}

interface FileExplorerProps {
    initialPath?: string;
    onSelect?: (path: string) => void;
    onCancel?: () => void;
    selectionMode?: 'file' | 'directory';
    title?: string;
    onSelectionChange?: (entry: FileEntry | null) => void;
    allowHideFooter?: boolean;
    renderEntryExtra?: (entry: FileEntry, isSelected: boolean) => React.ReactNode;
    isMultiSelect?: boolean;
    fallbackType?: 'tests' | 'suites';
    onNavigate?: (page: string) => void;
}

export function FileExplorer({ 
    initialPath = ".", 
    onSelect, 
    onCancel, 
    selectionMode = 'file', 
    title: _title, 
    onSelectionChange, 
    allowHideFooter = false, 
    renderEntryExtra,
    isMultiSelect = true,
    fallbackType,
    onNavigate
}: FileExplorerProps) {
    const { t } = useTranslation();
    const { toggleItem, isSelected: checkIsSelected } = useSelection();
    const { settings, updateSetting } = useSettings();
    const rootPath = settings.paths.automationRoot;
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
    const [warningModal, setWarningModal] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: '' });

    const [gitStatusEntries, setGitStatusEntries] = useState<Record<string, 'untracked' | 'modified' | 'staged' | 'deleted'>>({});
    const [gitCommitMessage, setGitCommitMessage] = useState("");
    const [showCommitModal, setShowCommitModal] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [pushing, setPushing] = useState(false);

    const getRelativePath = (entryPath: string) => {
        if (!rootPath) return entryPath;
        let rel = entryPath;
        if (entryPath.startsWith(rootPath)) {
            rel = entryPath.slice(rootPath.length);
        }
        return rel.replace(/\\/g, '/').replace(/^[\\/]/, '');
    };

    const fetchGitStatus = async () => {
        if (!settings.git?.enabled || !rootPath) {
            setGitStatusEntries({});
            return;
        }
        try {
            const statusList = await invoke<any[]>('get_git_status', { repoPath: rootPath });
            const mapping: Record<string, 'untracked' | 'modified' | 'staged' | 'deleted'> = {};
            statusList.forEach(item => {
                const normPath = item.file_path.replace(/\\/g, '/').replace(/^[\\/]/, '');
                mapping[normPath] = item.status;
            });
            setGitStatusEntries(mapping);
        } catch (e) {
            console.error("Failed to fetch git status:", e);
        }
    };

    const getGitStatusForEntry = (entry: FileEntry) => {
        if (!settings.git?.enabled) return null;
        
        const relPath = getRelativePath(entry.path);
        
        if (!entry.is_dir) {
            return gitStatusEntries[relPath] || null;
        } else {
            const prefix = relPath ? `${relPath}/` : '';
            let hasModified = false;
            let hasUntracked = false;
            let hasStaged = false;
            
            for (const [filePath, status] of Object.entries(gitStatusEntries)) {
                if (filePath.startsWith(prefix)) {
                    if (status === 'modified' || status === 'deleted') hasModified = true;
                    if (status === 'untracked') hasUntracked = true;
                    if (status === 'staged') hasStaged = true;
                }
            }
            
            if (hasModified) return 'modified';
            if (hasStaged) return 'staged';
            if (hasUntracked) return 'untracked';
            return null;
        }
    };

    const handleGitCommit = async () => {
        if (!rootPath || !gitCommitMessage.trim()) return;
        setCommitting(true);
        try {
            await invoke('git_commit', { repoPath: rootPath, message: gitCommitMessage.trim() });
            feedback.toast.success(t('file_explorer.git_commit_success', "Successfully committed changes!"));
            setGitCommitMessage("");
            setShowCommitModal(false);
            fetchGitStatus();
        } catch (err) {
            feedback.toast.error(String(err));
        } finally {
            setCommitting(false);
        }
    };

    const handleGitPush = async () => {
        if (!rootPath) return;
        setPushing(true);
        try {
            await invoke('git_push', { repoPath: rootPath });
            feedback.toast.success(t('file_explorer.git_push_success', "Successfully pushed changes to remote repository!"));
        } catch (err) {
            feedback.toast.error(String(err));
        } finally {
            setPushing(false);
        }
    };

    useEffect(() => {
        if (settings.git?.enabled && rootPath) {
            fetchGitStatus();
        } else {
            setGitStatusEntries({});
        }
    }, [settings.git?.enabled, rootPath, currentPath]);

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

        if (currentPath === '.' || currentPath === '/' || currentPath.endsWith(':\\') || currentPath === rootPath) {
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
                
                if (isMultiSelect && selectionMode === 'directory' && !entry.is_dir === false) {
                    toggleItem({
                        path: entry.path,
                        name: entry.name,
                        type: 'folder'
                    });
                }
            }
        } else {
            setSelectedEntry(entry);
            if (onSelectionChange) onSelectionChange(entry);

            if (isMultiSelect && selectionMode === 'file') {
                const type = entry.name.endsWith('.args') || entry.name.endsWith('.txt') ? 'args' : 'file';
                toggleItem({
                    path: entry.path,
                    name: entry.name,
                    type: type
                });
            }
        }
    };

    const handleConfirm = () => {
        if (!selectedEntry) {
            if (selectionMode === 'directory') {
                onSelect?.(currentPath);
            }
            return;
        }

        if (selectionMode === 'directory') {
            if (selectedEntry.is_dir) {
                onSelect?.(selectedEntry.path);
            } else {
                setWarningModal({
                    isOpen: true,
                    message: t('file_explorer.select_folder')
                });
            }
        } else {
            // File mode
            if (!selectedEntry.is_dir) {
                onSelect?.(selectedEntry.path);
            } else {
                handleNavigate(selectedEntry.path);
            }
        }
    };

    const handleSelectFolder = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            defaultPath: rootPath || undefined
        });

        if (selected && typeof selected === 'string') {
            if (fallbackType) {
                const key = fallbackType === 'tests' ? 'tests' : 'suites';
                await updateSetting('paths', {
                    ...settings.paths,
                    [key]: selected
                });
                feedback.toast.success(t('settings_page.path_auto_updated', { path: selected }));
            }
            setCurrentPath(selected);
        }
    };

    const isPathUnconfigured = fallbackType && (!initialPath || initialPath === "." || initialPath.trim() === "");

    return (
        <div className="flex flex-col h-full">
            <WarningModal
                isOpen={warningModal.isOpen}
                onClose={() => setWarningModal(prev => ({ ...prev, isOpen: false }))}
                title={t('common.attention', "Attention")}
                description={warningModal.message}
            />
            {/* Header / Breadcrumb */}
            {!isPathUnconfigured && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-transparent backdrop-blur-md rounded-2xl border border-outline-variant/30 shrink-0">
                    <button
                        onClick={handleUp}
                        disabled={currentPath === rootPath}
                        className="p-1 hover:bg-surface-variant/50 rounded transition-colors text-on-surface-variant/80 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t('file_explorer.up')}
                    >
                        <CornerLeftUp size={18} />
                    </button>
                    <div className="flex-1 font-mono text-sm truncate px-2 text-on-surface/80">
                        {rootPath && currentPath.startsWith(rootPath) 
                            ? (currentPath === rootPath ? './' : currentPath.replace(rootPath, '').replace(/^[\\/]/, ''))
                            : currentPath}
                    </div>
                    {settings.git?.enabled && (
                        <div className="flex items-center gap-1.5 pr-1 border-l border-outline-variant/20 pl-2">
                            <button
                                onClick={() => setShowCommitModal(true)}
                                disabled={!Object.values(gitStatusEntries).some(s => s === 'staged')}
                                className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
                                data-tooltip={t('file_explorer.git_commit_btn_tooltip', "Commit staged changes")}
                                data-position="bottom"
                            >
                                {t('file_explorer.commit', "Commit")}
                            </button>
                            <button
                                onClick={handleGitPush}
                                disabled={pushing}
                                className="flex items-center gap-1 px-2.5 py-1 bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
                                data-tooltip={t('file_explorer.git_push', "Push to remote")}
                                data-position="bottom"
                            >
                                {pushing ? t('file_explorer.pushing', "Pushing...") : t('file_explorer.push', "Push")}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto border border-outline-variant/30 rounded-2xl bg-transparent backdrop-blur-md p-1 min-h-0">
                {isPathUnconfigured ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                        <div className="p-4 bg-primary/10 rounded-full text-primary">
                            <FolderSearch size={48} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium text-on-surface">
                                {t('file_explorer.not_configured')}
                            </h3>
                            <p className="text-sm text-on-surface-variant max-w-xs mx-auto">
                                {fallbackType === 'tests' 
                                    ? t('file_explorer.configure_tests')
                                    : t('file_explorer.configure_suites')}
                            </p>
                        </div>
                        <button
                            onClick={handleSelectFolder}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-2xl text-sm font-medium hover:bg-primary/90 transition-all shadow-md active:scale-95"
                        >
                            <Folder size={18} />
                            {t('file_explorer.select_folder_btn')}
                        </button>

                        {onNavigate && (
                            <button
                                onClick={() => onNavigate?.('settings')}
                                className="flex items-center gap-2 px-6 py-2 text-on-surface-variant/60 hover:text-primary transition-all text-sm"
                            >
                                <Settings size={14} />
                                {t('common.go_to_settings', "Go to Settings")}
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {loading && (
                            <div className="flex flex-col items-center justify-center h-full text-on-surface/80">
                                <ExpressiveLoading size="md" variant="circular" className="mb-2" />
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
                                    const isSelected = checkIsSelected(entry.path);
                                    const isActive = selectedEntry?.path === entry.path;
                                    return (
                                        <div
                                            key={entry.path}
                                            onClick={() => handleEntryClick(entry)}
                                            onDoubleClick={() => entry.is_dir ? handleNavigate(entry.path) : (onSelect && onSelect(entry.path))}
                                            className={clsx(
                                                "flex items-center gap-3 px-3 py-2 rounded-2xl cursor-pointer text-sm select-none transition-all group",
                                                isSelected 
                                                    ? "bg-secondary-container/50 text-on-secondary-container ring-1 ring-primary/30"
                                                    : isActive
                                                        ? "bg-secondary-container/30 text-on-secondary-container"
                                                        : "hover:bg-surface-variant/30 text-on-surface/80"
                                            )}
                                        >
                                            {entry.is_dir ? (
                                                <Folder size={18} className={clsx(
                                                    "shrink-0",
                                                    isSelected ? "text-primary fill-primary/20" : "text-warning-container fill-warning-container/50"
                                                )} />
                                            ) : (
                                                (() => {
                                                    const Icon = entry.name.endsWith('.robot') ? FileCode : (entry.name.endsWith('.args') || entry.name.endsWith('.txt')) ? FileText : FileIcon;
                                                    return <Icon size={18} className={clsx(
                                                        "shrink-0",
                                                        isSelected ? "text-primary" : "text-on-surface/80"
                                                    )} />;
                                                })()
                                            )}
                                            <span className={clsx("truncate flex-1", isSelected && "text-primary font-medium")}>
                                                {entry.name}
                                            </span>
                                            {(() => {
                                                const gitStatus = getGitStatusForEntry(entry);
                                                if (!gitStatus) return null;
                                                
                                                let badgeColor = "";
                                                let badgeLabel = "";
                                                switch (gitStatus) {
                                                    case 'modified':
                                                        badgeColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                                                        badgeLabel = "M";
                                                        break;
                                                    case 'staged':
                                                        badgeColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                                                        badgeLabel = "A";
                                                        break;
                                                    case 'untracked':
                                                        badgeColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                                                        badgeLabel = "U";
                                                        break;
                                                    case 'deleted':
                                                        badgeColor = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                                                        badgeLabel = "D";
                                                        break;
                                                }

                                                return (
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {settings.git?.showBadges && (
                                                            <span 
                                                                className={clsx("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border cursor-help", badgeColor)}
                                                                data-tooltip={t(`file_explorer.git_status_${gitStatus}`)}
                                                                data-position="top"
                                                            >
                                                                {badgeLabel}
                                                            </span>
                                                        )}
                                                        {!entry.is_dir && (gitStatus === 'untracked' || gitStatus === 'modified') && (
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    try {
                                                                        await invoke('git_stage_file', { repoPath: rootPath, filePath: getRelativePath(entry.path) });
                                                                        feedback.toast.success(t('file_explorer.staged_success', { file: entry.name }));
                                                                        fetchGitStatus();
                                                                    } catch (err) {
                                                                        feedback.toast.error(String(err));
                                                                    }
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-primary/15 text-primary rounded-lg text-xs font-semibold hover:bg-primary/25 transition-all active:scale-95 cursor-pointer"
                                                                data-tooltip={t('file_explorer.git_stage_tooltip', "Stage changes")}
                                                                data-position="top"
                                                            >
                                                                {t('file_explorer.git_stage', "Stage")}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            {renderEntryExtra && renderEntryExtra(entry, isSelected)}
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
                    </>
                )}
            </div>

            {/* Footer */}
            {!allowHideFooter && (
                <div className="flex items-center justify-end gap-3 mt-4 pt-2 border-t border-outline-variant/30 shrink-0">
                    <div className="flex-1 text-xs text-on-surface/80 truncate">
                        {selectedEntry ? selectedEntry.name : selectionMode === 'directory' ? t('file_explorer.current') : t('file_explorer.no_selection')}
                    </div>
                    <button
                        onClick={() => onCancel?.()}
                        className="px-4 py-2 rounded-2xl text-sm font-medium text-on-surface-variant/80 hover:bg-surface-variant/30 transition-colors"
                    >
                        {t('file_explorer.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedEntry && selectionMode === 'file'}
                        className="px-4 py-2 rounded-2xl text-sm font-medium bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {selectionMode === 'directory' ? t('file_explorer.select_folder') : t('file_explorer.select_file')}
                    </button>
                </div>
            )}

            {/* Git Commit Modal */}
            {settings.git?.enabled && (
                <Modal
                    isOpen={showCommitModal}
                    onClose={() => {
                        setShowCommitModal(false);
                        setGitCommitMessage("");
                    }}
                    title={t('file_explorer.git_commit_title', "Commit Changes")}
                    className="max-w-md"
                >
                    <div className="space-y-4">
                        <Input
                            label={t('file_explorer.git_commit_message_label', "Commit Message")}
                            type="text"
                            value={gitCommitMessage}
                            onChange={(e) => setGitCommitMessage(e.target.value)}
                            placeholder={t('file_explorer.git_commit_placeholder', "e.g. update test scripts")}
                            autoFocus
                        />
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setShowCommitModal(false);
                                    setGitCommitMessage("");
                                }}
                            >
                                {t('common.cancel', "Cancel")}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleGitCommit}
                                disabled={!gitCommitMessage.trim() || committing}
                            >
                                {committing ? t('file_explorer.committing', "Committing...") : t('file_explorer.commit', "Commit")}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
