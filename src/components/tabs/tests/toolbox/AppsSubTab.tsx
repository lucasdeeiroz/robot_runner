import { useEffect, useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Search, Smartphone, Package, Trash2, Snowflake, PlayCircle, Eraser, Upload, ArrowDownAZ, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useTestSessions } from "@/lib/testSessionStore";
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from "sonner";
import { Virtuoso } from "react-virtuoso";

import { ConfirmationModal } from "@/components/organisms/ConfirmationModal";
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface PackageInfo {
    name: String;
    path: String;
    is_system: boolean;
    is_disabled: boolean;
}

interface AppsSubTabProps {
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;
}

export function AppsSubTab({ isTestRunning = false, allowActionsDuringTest = false }: AppsSubTabProps) {
    const { t } = useTranslation();
    const { sessions, activeSessionId } = useTestSessions();
    const activeSession = sessions.find(s => s.runId === activeSessionId);
    const activeDevice = activeSession?.deviceUdid;

    const [packages, setPackages] = useState<PackageInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [showSystem, setShowSystem] = useState(false);
    const [sortBy, setSortBy] = useState<'name' | 'package'>('name');

    // ... (rest of state)

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 500);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // ... (Modal State)
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
            feedback.toast.error("apps.fetch_error", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isTestRunning || allowActionsDuringTest) {
            fetchPackages();
        }
    }, [activeDevice, isTestRunning, allowActionsDuringTest]); // Don't auto-fetch if test running unless allowed, but let user manually refresh if they really want via button

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
            feedback.toast.error("apps.install_error", e);
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
        <div ref={containerRef} className="h-full flex-1 min-h-0 flex flex-col p-2">
            {/* Toolbar */}
            <Section
                title={t('apps.title', 'Apps')}
                icon={Package}
                variant="transparent"
                className="border-b border-outline-variant/30 pb-2 mb-2 p-2"
                status={
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={fetchPackages}
                            disabled={loading}
                            variant="ghost"
                            size="sm"
                            className="p-1.5 hover:bg-surface-variant/50 text-on-surface-variant/80 rounded transition-colors h-auto"
                            title={t('apps.actions.refresh')}
                        >
                            {loading ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={14} />}
                        </Button>
                        <Button
                            onClick={() => setSortBy(prev => prev === 'name' ? 'package' : 'name')}
                            variant="ghost"
                            size="sm"
                            className="p-1.5 hover:bg-surface-variant/50 text-on-surface-variant/80 rounded transition-colors h-auto"
                            title={sortBy === 'name' ? t('apps.actions.sort_by_package') : t('apps.actions.sort_by_name')}
                        >
                            {sortBy === 'name' ? <ArrowDownAZ size={14} /> : <Package size={14} />}
                        </Button>
                        <Button
                            onClick={() => setShowSystem(!showSystem)}
                            variant="ghost"
                            size="sm"
                            className={clsx(
                                "p-1.5 rounded border text-xs flex items-center gap-1.5 transition-colors h-auto",
                                showSystem ? "bg-primary-container border-primary-container text-on-primary-container" : "bg-transparent border-outline-variant/30 text-on-surface-variant/80 hover:text-on-surface/80"
                            )}
                            title={t('apps.toggle_system', "Toggle System Apps")}
                        >
                            <Smartphone size={14} />
                            {/* <span className="hidden xl:inline">System</span> */}
                        </Button>
                    </div>
                }
                menus={!isNarrow ? (
                    <div className="relative">
                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant/80 z-10" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('apps.search_placeholder', "Search packages...")}
                            className="bg-surface border border-outline-variant/30 rounded-2xl pl-8 py-1.5 text-xs text-on-surface/80 focus:outline-none focus:border-primary/50 w-64 transition-all"
                        />
                    </div>
                ) : null}
                actions={
                    <>
                        <Button
                            onClick={handleInstall}
                            variant="ghost"
                            size="sm"
                            disabled={isTestRunning && !allowActionsDuringTest}
                            className="bg-on-success-container/10/10 hover:bg-on-success-container/10/20 text-success border border-on-success-container/10/20"
                            title={t('apps.actions.install')}
                            leftIcon={<Upload size={14} />}
                        >
                            <span className="text-xs font-semibold hidden lg:inline">{t('apps.actions.install')}</span>
                        </Button>
                    </>
                }
            />

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {!activeDevice ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/80 gap-2">
                        <Smartphone size={32} className="opacity-20" />
                        <span className="text-sm">{t('apps.no_device', "No device selected")}</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/80 text-sm">
                        {loading ? (
                            <ExpressiveLoading size="lg" variant="circular" className="mb-2" />
                        ) : (
                            <Package size={32} className="opacity-20 mb-2" />
                        )}
                        <p>
                            {loading
                                ? t('common.loading', "Loading...")
                                : isTestRunning
                                    ? t('apps.status.paused_test', "Apps refresh paused during test")
                                    : t('apps.no_packages', "No packages found")
                            }
                        </p>
                    </div>
                ) : (
                    <Virtuoso
                        data={filtered}
                        className="custom-scrollbar"
                        style={{ height: '100%' }}
                        itemContent={(_index, pkg) => (
                            <div className="px-3 py-2 border-b border-outline-variant/30 hover:bg-surface-variant/20 group flex items-center gap-3">
                                <div className={clsx(
                                    "p-2 rounded-2xl shrink-0",
                                    pkg.is_system ? "bg-tertiary-container text-on-tertiary-container" : "bg-primary-container text-on-primary-container"
                                )}>
                                    <Package size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-on-surface/80 truncate font-medium flex items-center gap-2">
                                        {friendlyNames[String(pkg.name)] || pkg.name}
                                        {pkg.is_disabled && (
                                            <span className="text-[10px] bg-error-container text-on-error-container px-1 rounded uppercase font-bold tracking-wider">
                                                {t('apps.status.disabled_badge', "Disabled")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-on-surface-variant/80 truncate font-mono opacity-70 flex items-center gap-2">
                                        <span>{pkg.name}</span>
                                        <span className="text-outline-variant px-1">•</span>
                                        <span title={String(pkg.path)} className="truncate max-w-[150px] cursor-help hover:text-on-surface/80 transition-colors">
                                            {pkg.path}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                    {pkg.is_disabled ? (
                                        <Button size="icon" variant="ghost" onClick={() => confirmFreeze(String(pkg.name), false)} className="h-7 w-7 hover:bg-primary/10 text-info-container/80 rounded" title={t('apps.actions.enable', "Enable")}>
                                            <PlayCircle size={14} />
                                        </Button>
                                    ) : (
                                        <Button size="icon" variant="ghost" onClick={() => confirmFreeze(String(pkg.name), true)} className="h-7 w-7 hover:bg-sky-500/10 text-sky-400 rounded" title={t('apps.actions.disable', "Freeze")}>
                                            <Snowflake size={14} />
                                        </Button>
                                    )}

                                    <Button size="icon" variant="ghost" onClick={() => confirmClear(String(pkg.name))} className="h-7 w-7 hover:bg-warning/10 text-warning-container/40 rounded" title={t('apps.actions.clear', "Clear Data")}>
                                        <Eraser size={14} />
                                    </Button>

                                    <Button size="icon" variant="ghost" onClick={() => confirmUninstall(String(pkg.name))} className="h-7 w-7 hover:bg-error/10 text-error-container/60 rounded" title={t('apps.actions.uninstall', "Uninstall")}>
                                        <Trash2 size={14} />
                                    </Button>
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
