import { useEffect, useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Search, Smartphone, Package, Trash2, Snowflake, PlayCircle, Eraser, Upload, ArrowDownAZ, RefreshCw, Rocket, Download, OctagonX } from "lucide-react";
import clsx from "clsx";
import { useTestSessions } from "@/lib/testSessionStore";
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from "@tauri-apps/plugin-opener";
import { Virtuoso } from "react-virtuoso";
import packageJson from "../../../../../package.json";

import { ConfirmationModal } from "@/components/organisms/ConfirmationModal";
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { SplitButton } from "@/components/molecules/SplitButton";
import { useCompanion } from "@/hooks/useCompanion";

interface PackageInfo {
    name: string;
    label?: string;
    path: string;
    version: string;
    is_system: boolean;
    is_disabled: boolean;
    icon?: string;
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
    const { status: companionStatus } = useCompanion(activeDevice || '');

    const [packages, setPackages] = useState<PackageInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [showSystem, setShowSystem] = useState(false);
    const [sortBy, setSortBy] = useState<'name' | 'package'>('name');
    const [reinstall, setReinstall] = useState(true);
    const [downgrade, setDowngrade] = useState(false);
    const [grantPermissions, setGrantPermissions] = useState(false);
    const [allowTest, setAllowTest] = useState(false);
    const [installSdcard, setInstallSdcard] = useState(false);
    const [iconMap, setIconMap] = useState<Record<string, string>>({});

    const loadIcon = (pkgName: string) => {
        if (!activeDevice || iconMap[pkgName]) return;
        invoke<string>("get_app_icon", { device: activeDevice, package: pkgName })
            .then((icon) => {
                if (icon) {
                    setIconMap(prev => ({ ...prev, [pkgName]: icon }));
                }
            })
            .catch(() => { });
    };

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
            const initialIcons: Record<string, string> = {};
            list.forEach(p => {
                if (p.icon) {
                    initialIcons[p.name] = p.icon;
                }
            });
            if (Object.keys(initialIcons).length > 0) {
                setIconMap(prev => ({ ...initialIcons, ...prev }));
            }
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
    }, [activeDevice, isTestRunning, allowActionsDuringTest]);

    // When Companion finishes connecting, automatically re-fetch if packages were loaded without Companion labels
    useEffect(() => {
        if (companionStatus === 'connected' && (!isTestRunning || allowActionsDuringTest)) {
            fetchPackages();
        }
    }, [companionStatus]);

    const friendlyNames = useMemo(() => calculateUniqueLabels(packages), [packages]);

    const filtered = packages.filter(p => {
        if (!showSystem && p.is_system) return false;
        if (!search) return true;
        const lower = search.toLowerCase();
        const label = p.label || friendlyNames[String(p.name)] || "";
        return p.name.toLowerCase().includes(lower) ||
            label.toLowerCase().includes(lower) ||
            p.path.toLowerCase().includes(lower);
    }).sort((a, b) => {
        if (sortBy === 'name') {
            const nameA = (a.label || friendlyNames[String(a.name)] || String(a.name)).toLowerCase();
            const nameB = (b.label || friendlyNames[String(b.name)] || String(b.name)).toLowerCase();
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
                feedback.toast.raw.success(t('apps.success.uninstalled', { pkg, defaultValue: `Uninstalled ${pkg}` }));
            } else if (type === 'disable') {
                await invoke("disable_package", { device: activeDevice, package: pkg });
                feedback.toast.raw.success(t('apps.success.disabled', { pkg, defaultValue: `Disabled ${pkg}` }));
            } else if (type === 'enable') {
                await invoke("enable_package", { device: activeDevice, package: pkg });
                feedback.toast.raw.success(t('apps.success.enabled', { pkg, defaultValue: `Enabled ${pkg}` }));
            } else if (type === 'clear') {
                await invoke("clear_package", { device: activeDevice, package: pkg });
                feedback.toast.raw.success(t('apps.success.cleared', { pkg, defaultValue: `Cleared data for ${pkg}` }));
            }
            fetchPackages();
        } catch (e) {
            feedback.toast.raw.error(t('apps.error.action_failed', { defaultValue: 'Action failed' }), e);
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
                toastId = feedback.toast.raw.loading(t('apps.status.installing', "Installing APK..."));
                await invoke("install_package", {
                    device: activeDevice,
                    path: selected,
                    downgrade,
                    grant_permissions: grantPermissions,
                    allow_test: allowTest,
                    install_sdcard: installSdcard,
                });
                feedback.toast.raw.success(t('apps.success.installed', "APK installed successfully"));
                fetchPackages();
            }
        } catch (e) {
            feedback.toast.error("apps.install_error", e);
        } finally {
            if (toastId !== null) {
                feedback.toast.dismiss(toastId);
            }
        }
    };

    const handleLaunch = async (pkg: string) => {
        try {
            await invoke("launch_package", { device: activeDevice, package: pkg });
            feedback.toast.raw.success(t('apps.success.launched', { pkg, defaultValue: `Launched ${pkg}` }));
        } catch (e) {
            feedback.toast.raw.error(t('apps.error.launch_failed', { defaultValue: 'Failed to launch app' }), e);
        }
    };

    const handleForceStop = async (pkg: string) => {
        try {
            await invoke("force_stop_package", { device: activeDevice, package: pkg });
            feedback.toast.raw.success(t('apps.success.force_stopped', { pkg, defaultValue: `Force stopped ${pkg}` }));
        } catch (e) {
            feedback.toast.raw.error(t('apps.error.force_stop_failed', { defaultValue: 'Failed to force stop app' }), e);
        }
    };

    const handleDownload = async (pkg: PackageInfo) => {
        try {
            const destination = await save({
                filters: [{ name: 'APK', extensions: ['apk'] }],
                defaultPath: `${pkg.name}.apk`
            });
            if (destination) {
                const toastId = feedback.toast.raw.loading(t('apps.status.downloading', { pkg: pkg.name, defaultValue: `Downloading ${pkg.name}...` }));
                try {
                    await invoke("pull_apk", { device: activeDevice, path: pkg.path, destination });
                    feedback.toast.dismiss(toastId);
                    feedback.toast.raw.success(t('apps.success.downloaded', { pkg: pkg.name, defaultValue: `Downloaded ${pkg.name}` }));
                } catch (err) {
                    feedback.toast.dismiss(toastId);
                    feedback.toast.raw.error(t('apps.error.download_failed', { defaultValue: 'Failed to download APK' }), err);
                }
            }
        } catch (e) {
            feedback.toast.raw.error(t('apps.error.download_failed', { defaultValue: 'Failed to download APK' }), e);
        }
    };

    const handleDownloadCompanion = async () => {
        try {
            let version = packageJson.version || '2.3.3';
            try {
                const { getVersion } = await import('@tauri-apps/api/app');
                const v = await getVersion();
                if (v) version = v;
            } catch (_) { }

            const tag = version.startsWith('v') ? version : `v${version}`;
            const downloadUrl = `https://github.com/lucasdeeiroz/robot_runner/releases/download/${tag}/companion.apk`;

            feedback.toast.raw.success(t('apps.downloading_companion', { version: tag, defaultValue: `Downloading companion.apk (${tag})...` }));
            await openUrl(downloadUrl);
        } catch (e) {
            feedback.toast.raw.error(t('apps.error.download_companion_failed', { defaultValue: 'Failed to open download link' }), e);
        }
    };


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
                            data-tooltip={t('apps.actions.refresh')}
                            data-position="left"
                        >
                            {loading ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={14} />}
                        </Button>
                        <Button
                            onClick={() => setSortBy(prev => prev === 'name' ? 'package' : 'name')}
                            variant="ghost"
                            size="sm"
                            className="p-1.5 hover:bg-surface-variant/50 text-on-surface-variant/80 rounded transition-colors h-auto"
                            data-tooltip={sortBy === 'name' ? t('apps.actions.sort_by_package') : t('apps.actions.sort_by_name')}
                            data-position="left"
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
                            data-tooltip={t('apps.toggle_system', "Toggle System Apps")}
                            data-position="left"
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
                    <div className="flex items-center gap-2">
                        {companionStatus === 'not_installed' && (
                            <Button
                                onClick={handleDownloadCompanion}
                                variant="ghost"
                                size="sm"
                                className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl py-1.5 px-3 transition-all h-auto"
                                data-tooltip={t('apps.download_companion_tooltip', { version: packageJson.version, defaultValue: `Download companion.apk from current release (v${packageJson.version})` })}
                                data-position="bottom"
                            >
                                <Rocket size={14} className="text-primary animate-pulse" />
                                <span>{t('apps.download_companion', 'Download Companion APK')}</span>
                            </Button>
                        )}
                        <SplitButton
                            disabled={isTestRunning && !allowActionsDuringTest}
                            variant="primary"
                            primaryAction={{
                                label: t('apps.actions.install', 'Install APK'),
                                onClick: handleInstall,
                                icon: <Upload size={14} />
                            }}
                            secondaryActions={[
                                {
                                    label: t('apps.actions.reinstall', 'Reinstall'),
                                    type: 'checkbox',
                                    checked: reinstall,
                                    onClick: () => setReinstall(prev => !prev)
                                },
                                {
                                    label: t('apps.actions.allow_downgrade', 'Downgrade (-d)'),
                                    type: 'checkbox',
                                    checked: downgrade,
                                    onClick: () => setDowngrade(prev => !prev)
                                },
                                {
                                    label: t('apps.actions.grant_permissions', 'Grant Permissions (-g)'),
                                    type: 'checkbox',
                                    checked: grantPermissions,
                                    onClick: () => setGrantPermissions(prev => !prev)
                                },
                                {
                                    label: t('apps.actions.allow_test', 'Allow Test APKs (-t)'),
                                    type: 'checkbox',
                                    checked: allowTest,
                                    onClick: () => setAllowTest(prev => !prev)
                                },
                                {
                                    label: t('apps.actions.install_sdcard', 'Install to SD Card (-s)'),
                                    type: 'checkbox',
                                    checked: installSdcard,
                                    onClick: () => setInstallSdcard(prev => !prev)
                                }
                            ]}
                        />
                    </div>
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
                        className="custom-scrollbar overflow-y-auto"
                        style={{ height: '100%' }}
                        itemContent={(_index, pkg) => {
                            const pkgName = String(pkg.name);
                            const hasIcon = iconMap[pkgName] || pkg.icon;
                            if (!hasIcon) {
                                loadIcon(pkgName);
                            }
                            const displayName = pkg.label || friendlyNames[pkgName] || pkgName;

                            return (
                                <div className="px-3 py-2 border-b border-outline-variant/30 hover:bg-surface-variant/20 group flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-surface-variant/40 border border-outline-variant/30 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                                        {hasIcon ? (
                                            <img
                                                src={iconMap[pkgName] || pkg.icon}
                                                alt={displayName}
                                                className="w-full h-full object-cover rounded-xl"
                                            />
                                        ) : (
                                            <div className={clsx(
                                                "w-full h-full flex items-center justify-center rounded-xl",
                                                pkg.is_system ? "bg-tertiary-container text-on-tertiary-container" : "bg-primary-container text-on-primary-container"
                                            )}>
                                                <Package size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-on-surface/80 truncate font-medium flex items-center gap-2">
                                            {displayName}
                                            {pkg.is_disabled && (
                                                <span className="text-[10px] bg-error-container text-on-error-container px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                                    {t('apps.status.disabled_badge', "Disabled")}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-on-surface-variant/80 truncate font-mono opacity-70 flex items-center gap-2">
                                            <span className="shrink-0 truncate max-w-[40%]">{pkg.name}</span>
                                            {pkg.version && (
                                                <>
                                                    <span className="text-outline-variant px-1 shrink-0">•</span>
                                                    <span className="shrink-0 text-primary">v{pkg.version}</span>
                                                </>
                                            )}
                                            <span className="text-outline-variant px-1 shrink-0">•</span>
                                            <span data-tooltip={String(pkg.path)} data-position="left" className="truncate cursor-help hover:text-on-surface/80 transition-colors">
                                                {pkg.path}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="icon" variant="ghost" onClick={() => handleLaunch(String(pkg.name))} className="h-7 w-7 hover:bg-success/10 text-success/80 rounded" data-tooltip={`${t('apps.actions.launch', "Launch")} (adb shell monkey)`} data-position="left">
                                            <Rocket size={14} />
                                        </Button>

                                        <Button size="icon" variant="ghost" onClick={() => handleDownload(pkg)} className="h-7 w-7 hover:bg-primary/10 text-primary/80 rounded" data-tooltip={`${t('apps.actions.download', "Download APK")} (adb pull)`} data-position="left">
                                            <Download size={14} />
                                        </Button>

                                        {pkg.is_disabled ? (
                                            <Button size="icon" variant="ghost" onClick={() => confirmFreeze(String(pkg.name), false)} className="h-7 w-7 hover:bg-primary/10 text-info-container/80 rounded" data-tooltip={`${t('apps.actions.enable', "Enable")} (adb shell pm enable)`} data-position="left">
                                                <PlayCircle size={14} />
                                            </Button>
                                        ) : (
                                            <Button size="icon" variant="ghost" onClick={() => confirmFreeze(String(pkg.name), true)} className="h-7 w-7 hover:bg-sky-500/10 text-sky-400 rounded" data-tooltip={`${t('apps.actions.disable', "Freeze")} (adb shell pm disable-user)`} data-position="left">
                                                <Snowflake size={14} />
                                            </Button>
                                        )}

                                        <Button size="icon" variant="ghost" onClick={() => handleForceStop(String(pkg.name))} className="h-7 w-7 hover:bg-error/10 text-error/80 rounded" data-tooltip={`${t('apps.actions.force_stop', "Force Stop")} (adb shell am force-stop)`} data-position="left">
                                            <OctagonX size={14} />
                                        </Button>

                                        <Button size="icon" variant="ghost" onClick={() => confirmClear(String(pkg.name))} className="h-7 w-7 hover:bg-warning/10 text-warning-container/40 rounded" data-tooltip={`${t('apps.actions.clear', "Clear Data")} (adb shell pm clear)`} data-position="left">
                                            <Eraser size={14} />
                                        </Button>

                                        <Button size="icon" variant="ghost" onClick={() => confirmUninstall(String(pkg.name))} className="h-7 w-7 hover:bg-error/10 text-error-container/60 rounded" data-tooltip={`${t('apps.actions.uninstall', "Uninstall")} (adb uninstall)`} data-position="left">
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                </div>
                            );
                        }}
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
