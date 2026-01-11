import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, Smartphone, Package, Trash2, Snowflake, PlayCircle, Eraser, Upload, ArrowDownAZ } from "lucide-react";
import clsx from "clsx";
import { useTestSessions } from "@/lib/testSessionStore";
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from "sonner";
import { Virtuoso } from "react-virtuoso";

import { ConfirmationModal } from "@/components/shared/ConfirmationModal";

interface PackageInfo {
    name: String;
    path: String;
    is_system: boolean;
    is_disabled: boolean;
}

export function AppsSubTab() {
    const { t } = useTranslation();
    const { sessions, activeSessionId } = useTestSessions();
    const activeSession = sessions.find(s => s.runId === activeSessionId);
    const activeDevice = activeSession?.deviceUdid;

    const [packages, setPackages] = useState<PackageInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [showSystem, setShowSystem] = useState(false);
    const [sortBy, setSortBy] = useState<'name' | 'package'>('name');

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: 'uninstall' | 'disable' | 'enable' | 'clear' | null;
        pkg: string | null;
        description: string;
        title: string;
    }>({
        isOpen: false,
        type: null,
        pkg: null,
        description: "",
        title: ""
    });

    const closeConfirmation = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const fetchPackages = async () => {
        if (!activeDevice) return;
        setLoading(true);
        try {
            const list = await invoke<PackageInfo[]>("get_installed_packages", { device: activeDevice });
            setPackages(list);
        } catch (e) {
            console.error(e);
            toast.error(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPackages();
    }, [activeDevice]);

    const friendlyNames = useMemo(() => calculateUniqueLabels(packages), [packages]);

    const filtered = packages.filter(p => {
        if (!showSystem && p.is_system) return false;
        if (!search) return true;
        const lower = search.toLowerCase();
        return p.name.toLowerCase().includes(lower) || p.path.toLowerCase().includes(lower);
    }).sort((a, b) => {
        if (sortBy === 'name') {
            const nameA = (friendlyNames[String(a.name)] || String(a.name)).toLowerCase();
            const nameB = (friendlyNames[String(b.name)] || String(b.name)).toLowerCase();
            return nameA.localeCompare(nameB);
        }
        return String(a.name).localeCompare(String(b.name));
    });

    const confirmUninstall = (pkg: string) => {
        setModalConfig({
            isOpen: true,
            type: 'uninstall',
            pkg,
            title: t('apps.actions.uninstall_title', "Uninstall Package"),
            description: t('apps.actions.uninstall_confirm', { pkg, defaultValue: `Are you sure you want to uninstall ${pkg}?` }),
        });
    };

    const confirmFreeze = (pkg: string, freeze: boolean) => {
        setModalConfig({
            isOpen: true,
            type: freeze ? 'disable' : 'enable',
            pkg,
            title: freeze ? t('apps.actions.disable_title', "Disable App") : t('apps.actions.enable_title', "Enable App"),
            description: freeze
                ? t('apps.actions.disable_confirm', { pkg, defaultValue: `Disable ${pkg}?` })
                : t('apps.actions.enable_confirm', { pkg, defaultValue: `Enable ${pkg}?` }),
        });
    };

    const confirmClear = (pkg: string) => {
        setModalConfig({
            isOpen: true,
            type: 'clear',
            pkg,
            title: t('apps.actions.clear_title', "Clear Data"),
            description: t('apps.actions.clear_confirm', { pkg, defaultValue: `Clear all data for ${pkg}?` }),
        });
    };

    const handleConfirmAction = async () => {
        if (!modalConfig.pkg || !modalConfig.type) return;
        const { pkg, type } = modalConfig;

        try {
            if (type === 'uninstall') {
                await invoke("uninstall_package", { device: activeDevice, package: pkg });
                toast.success(t('apps.success.uninstalled', { pkg }));
            } else if (type === 'disable') {
                await invoke("disable_package", { device: activeDevice, package: pkg });
                toast.success(t('apps.success.disabled', { pkg }));
            } else if (type === 'enable') {
                await invoke("enable_package", { device: activeDevice, package: pkg });
                toast.success(t('apps.success.enabled', { pkg }));
            } else if (type === 'clear') {
                await invoke("clear_package", { device: activeDevice, package: pkg });
                toast.success(t('apps.success.cleared', { pkg }));
            }
            fetchPackages();
        } catch (e) {
            toast.error(String(e));
        } finally {
            closeConfirmation();
        }
    };



    const handleInstall = async () => {
        let toastId: string | number | null = null;
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'APK', extensions: ['apk'] }]
            });
            if (selected) {
                toastId = toast.loading(t('apps.status.installing', "Installing APK..."));
                await invoke("install_package", { device: activeDevice, path: selected });
                toast.success(t('apps.success.installed', "APK installed successfully"));
                fetchPackages();
            }
        } catch (e) {
            console.error(e);
            toast.error(t('apps.error.install_failed', { error: String(e), defaultValue: `Installation failed: ${String(e)}` }));
        } finally {
            if (toastId !== null) {
                toast.dismiss(toastId);
            }
        }
    };

    /*
    const handleBackup = async (pkg: PackageInfo) => {
        // ...
        toast.info("Coming soon");
    };
    */


    return (
        <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900/50">
            {/* Toolbar */}
            <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t('apps.search_placeholder', "Search packages...")}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-8 py-1.5 text-xs text-zinc-900 dark:text-zinc-300 focus:outline-none focus:border-primary/50"
                    />
                </div>

                <button
                    onClick={() => setShowSystem(!showSystem)}
                    className={clsx(
                        "p-1.5 rounded border text-xs flex items-center gap-1.5 transition-colors",
                        showSystem ? "bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400" : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                    title={t('apps.toggle_system', "Toggle System Apps")}
                >
                    <Smartphone size={14} />
                    {/* <span className="hidden xl:inline">System</span> */}
                </button>

                <button
                    onClick={handleInstall}
                    className="p-1.5 bg-green-600/10 hover:bg-green-600/20 text-green-500 border border-green-600/20 rounded flex items-center gap-1.5 transition-colors"
                    title={t('apps.actions.install')}
                >
                    <Upload size={14} />
                    <span className="text-xs font-semibold hidden lg:inline">{t('apps.actions.install')}</span>
                </button>

                <button
                    onClick={() => setSortBy(prev => prev === 'name' ? 'package' : 'name')}
                    className="p-1.5 hover:bg-zinc-800 text-zinc-400 rounded transition-colors"
                    title={sortBy === 'name' ? t('apps.actions.sort_by_package') : t('apps.actions.sort_by_name')}
                >
                    {sortBy === 'name' ? <ArrowDownAZ size={14} /> : <Package size={14} />}
                </button>

                <button
                    onClick={fetchPackages}
                    disabled={loading}
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 rounded transition-colors"
                    title={t('apps.actions.refresh')}
                >
                    <RefreshCw size={14} className={clsx(loading && "animate-spin")} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {!activeDevice ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2">
                        <Smartphone size={32} className="opacity-20" />
                        <span className="text-sm">{t('apps.no_device', "No device selected")}</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2">
                        <Package size={32} className="opacity-20" />
                        <span className="text-sm">{loading ? t('common.loading', "Loading...") : t('apps.no_packages', "No packages found")}</span>
                    </div>
                ) : (
                    <Virtuoso
                        data={filtered}
                        className="custom-scrollbar"
                        itemContent={(_index, pkg) => (
                            <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/30 group flex items-center gap-3">
                                <div className={clsx(
                                    "p-2 rounded-lg shrink-0",
                                    pkg.is_system ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                                )}>
                                    <Package size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-800 dark:text-zinc-200 truncate font-medium flex items-center gap-2">
                                        {friendlyNames[String(pkg.name)] || pkg.name}
                                        {pkg.is_disabled && (
                                            <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded uppercase font-bold tracking-wider">
                                                {t('apps.status.disabled_badge', "Disabled")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-zinc-500 truncate font-mono opacity-70 flex items-center gap-2">
                                        <span>{pkg.name}</span>
                                        <span className="text-zinc-300 dark:text-zinc-600 px-1">•</span>
                                        <span title={String(pkg.path)} className="truncate max-w-[150px] cursor-help hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">
                                            {pkg.path}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                    {pkg.is_disabled ? (
                                        <button onClick={() => confirmFreeze(String(pkg.name), false)} className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded" title={t('apps.actions.enable', "Enable")}>
                                            <PlayCircle size={14} />
                                        </button>
                                    ) : (
                                        <button onClick={() => confirmFreeze(String(pkg.name), true)} className="p-1.5 hover:bg-sky-500/10 text-sky-400 rounded" title={t('apps.actions.disable', "Freeze")}>
                                            <Snowflake size={14} />
                                        </button>
                                    )}

                                    <button onClick={() => confirmClear(String(pkg.name))} className="p-1.5 hover:bg-yellow-500/10 text-yellow-400 rounded" title={t('apps.actions.clear', "Clear Data")}>
                                        <Eraser size={14} />
                                    </button>

                                    <button onClick={() => confirmUninstall(String(pkg.name))} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded" title={t('apps.actions.uninstall', "Uninstall")}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    />
                )}
            </div>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={closeConfirmation}
                onConfirm={handleConfirmAction}
                title={modalConfig.title}
                description={modalConfig.description}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                variant={modalConfig.type === 'enable' ? 'warning' : 'danger'}
            />
        </div >
    );
}



function calculateUniqueLabels(packages: PackageInfo[]): Record<string, string> {
    const map: Record<string, { parts: string[], useCount: number, label: string, id: string }> = {};

    // 1. Initialize
    packages.forEach(p => {
        const id = String(p.name);
        if (!id) return;
        const parts = id.split('.');
        map[id] = {
            parts,
            useCount: 1,
            label: "",
            id
        };
        // Initial label (last part)
        map[id].label = formatPart(parts[parts.length - 1]);
    });

    // 2. Resolve Collisions Iteratively
    let hasCollision = true;
    let iteration = 0;
    // Limit to max iterations to prevent infinite loops in weird cases
    while (hasCollision && iteration < 10) {
        hasCollision = false;
        iteration++;
        const labelCounts: Record<string, number> = {};

        // Count occurrences of each label
        Object.values(map).forEach(item => {
            labelCounts[item.label] = (labelCounts[item.label] || 0) + 1;
        });

        // If duplicate found, increment useCount for those specific items
        Object.values(map).forEach(item => {
            if (labelCounts[item.label] > 1 && item.useCount < item.parts.length) {
                // Collision and we have more parts to use
                item.useCount++;
                hasCollision = true;

                // Rebuild label with new count
                const start = item.parts.length - item.useCount;
                const end = item.parts.length;
                item.label = item.parts.slice(start, end).map(formatPart).join(' ');
            }
        });
    }

    // 3. Build Result Map
    const result: Record<string, string> = {};
    Object.values(map).forEach(item => {
        result[item.id] = item.label;
    });
    return result;
}

function formatPart(part: string): string {
    if (!part) return "";
    return part.charAt(0).toUpperCase() + part.slice(1);
}
