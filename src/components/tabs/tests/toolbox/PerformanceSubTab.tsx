import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Activity, Cpu, Battery, CircuitBoard, Play, Square, Package as PackageIcon, Eye, RefreshCw, Zap, FolderSearch, Settings, ListTree, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";
import { WarningModal } from "@/components/organisms/WarningModal";

import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { Section } from "@/components/organisms/Section";
import { DeviceStats } from "@/hooks/usePerformanceRecorder";
import { useProcessMonitor } from "@/hooks/useProcessMonitor";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface PerformanceSubTabProps {
    selectedDevice: string;
    stats: DeviceStats | null;
    history: (DeviceStats & { timestamp: number })[];
    error: string | null;
    autoRefresh: boolean;
    setAutoRefresh: (val: boolean) => void;
    selectedPackage: string;
    setSelectedPackage: (val: string) => void;
    isRecording: boolean;
    recordingStartTime?: number | null;
    toggleRecording: () => void;
    lastSaved: string | null;
    setLastSaved: (val: string | null) => void;
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;

    onRefresh: () => void;
    isLoading?: boolean;
    forceEnable?: boolean;
    setForceEnable?: (val: boolean) => void;
    onNavigate?: (page: string) => void;
}

export const PerformanceSubTab = React.memo(function PerformanceSubTab({
    selectedDevice,
    stats,
    history,
    error,
    autoRefresh,
    setAutoRefresh,
    selectedPackage,
    setSelectedPackage,
    isRecording,
    recordingStartTime,
    toggleRecording,
    lastSaved,
    setLastSaved,
    isTestRunning = false,
    allowActionsDuringTest = false,

    onRefresh,
    isLoading = false,
    forceEnable = false,
    setForceEnable,
    onNavigate
}: PerformanceSubTabProps) {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const [showHighImpactWarning, setShowHighImpactWarning] = useState(false);

    // Process Monitor State
    const [showProcessMonitor, setShowProcessMonitor] = useState(true);
    const [autoRefreshProcessMonitor, setAutoRefreshProcessMonitor] = useState(true);

    // Collapsible Sections State
    const [showDeviceStatsSection, setShowDeviceStatsSection] = useState(true);
    const [showAppStatsSection, setShowAppStatsSection] = useState(true);
    const [showChartsSection, setShowChartsSection] = useState(true);
    const [autoRefreshCharts, setAutoRefreshCharts] = useState(true);
    const frozenHistory = useMemo(() => history, [autoRefreshCharts ? history : null]);

    const [elapsedTime, setElapsedTime] = useState('00:00');
    useEffect(() => {
        if (isRecording && recordingStartTime) {
            const interval = setInterval(() => {
                const diff = Date.now() - recordingStartTime;
                const minutes = Math.floor(diff / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                setElapsedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setElapsedTime('00:00');
        }
    }, [isRecording, recordingStartTime]);


    const [batteryEstimate, setBatteryEstimate] = useState<string | null>(null);
    useEffect(() => {
        if (stats?.battery_status === 'discharging' && frozenHistory.length > 0) {
            const past = frozenHistory.find(h => Date.now() - h.timestamp > 30000);
            if (past && past.battery_level > stats.battery_level) {
                const drop = past.battery_level - stats.battery_level;
                const timeDiff = Date.now() - past.timestamp;
                if (timeDiff > 0 && drop > 0) {
                    const dropRatePerMs = drop / timeDiff;
                    const timeRemainingMs = stats.battery_level / dropRatePerMs;
                    const hrs = Math.floor(timeRemainingMs / 3600000);
                    const mins = Math.floor((timeRemainingMs % 3600000) / 60000);
                    setBatteryEstimate(`~${hrs}h ${mins}m`);
                }
            }
        } else if (stats?.battery_status === 'charging') {
            setBatteryEstimate(t('performance.charging', 'Charging'));
        } else {
            setBatteryEstimate(null);
        }
    }, [stats, frozenHistory, t]);

    const processMonitor = useProcessMonitor(
        selectedDevice,
        showProcessMonitor,
        autoRefreshProcessMonitor,
        isTestRunning,
        allowActionsDuringTest,
        forceEnable
    );

    // Battery Audit State
    interface BatteryAuditApp {
        uid: string;
        name: string;
        usage: number;
        details: string;
    }

    interface BatteryAuditData {
        capacity: number;
        computed_drain: number;
        actual_drain: number;
        apps: BatteryAuditApp[];
    }

    const [showBatteryAudit, setShowBatteryAudit] = useState(true);
    const [batteryAuditData, setBatteryAuditData] = useState<BatteryAuditData | null>(null);
    const [batteryAuditLastUpdate, setBatteryAuditLastUpdate] = useState<number | null>(null);
    const [isBatteryAuditLoading, setIsBatteryAuditLoading] = useState(false);

    useEffect(() => {
        if (showBatteryAudit && !batteryAuditData && !isBatteryAuditLoading) {
            fetchBatteryAudit();
        }
    }, []);

    const fetchBatteryAudit = async () => {
        setIsBatteryAuditLoading(true);
        try {
            const data: BatteryAuditData = await invoke("get_battery_audit", { device: selectedDevice });
            setBatteryAuditData(data);
            setBatteryAuditLastUpdate(Date.now());
        } catch (e) {
            feedback.toast.error(String(e));
        } finally {
            setIsBatteryAuditLoading(false);
        }
    };

    const resetBatteryAudit = async () => {
        setIsBatteryAuditLoading(true);
        try {
            await invoke("reset_battery_stats", { device: selectedDevice });
            feedback.toast.success(t('performance.battery_reset_success', 'Battery stats reset successfully'));
            await fetchBatteryAudit();
        } catch (e) {
            feedback.toast.error(String(e));
        } finally {
            setIsBatteryAuditLoading(false);
        }
    };

    const handleConfigurePath = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            defaultPath: settings.paths.automationRoot || undefined
        });

        if (selected && typeof selected === 'string') {
            await updateSetting('paths', {
                ...settings.paths,
                logcat: selected
            });
            feedback.toast.success(t('settings_page.path_auto_updated', { path: selected }));
        }
    };

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

    const formatBytes = (kb: number | undefined | null, showUnit: boolean = true) => {
        if (kb === undefined || kb === null || isNaN(kb)) return t('performance.na', 'N/A');
        if (kb > 1024 * 1024) return <>{(kb / (1024 * 1024)).toFixed(1)} {showUnit && <span className="text-sm text-on-surface-variant/80 font-normal">GB</span>}</>;
        if (kb > 1024) return <>{(kb / 1024).toFixed(1)} {showUnit && <span className="text-sm text-on-surface-variant/80 font-normal">MB</span>}</>;
        return <>{kb} {showUnit && <span className="text-sm text-on-surface-variant/80 font-normal">KB</span>}</>;
    };

    const formatRate = (val: number | undefined | null, unit: string, additional?: string) => {
        if (val === undefined || val === null || isNaN(val)) return t('performance.na', 'N/A');
        return <>{val.toFixed(1)} <span className="text-sm text-on-surface-variant/80 font-normal">{unit} {additional}</span></>;
    };

    const formatFPS = (val: number | undefined | null) => {
        if (val === undefined || val === null || isNaN(val)) return t('performance.na', 'N/A');
        return <>{Math.round(val)} <span className="text-sm text-on-surface-variant/80 font-normal">fps</span></>;
    };

    const getBatteryColor = (level: number) => {
        if (level > 20) return "text-success";
        if (level > 10) return "text-warning";
        return "text-error";
    };

    const getBatteryStatusText = (status: string, power: string) => {
        let powerText = "";
        if (power === "ac") powerText = ` (${t('performance.ac', 'AC')})`;
        if (power === "usb") powerText = ` (${t('performance.usb', 'USB')})`;
        if (power === "wireless") powerText = ` (${t('performance.wireless', 'Wireless')})`;

        if (status === "charging") return `${t('performance.charging', 'Charging')}${powerText}`;
        if (status === "discharging") return t('performance.discharging', 'Discharging');
        if (status === "full") return `${t('performance.full', 'Full')}${powerText}`;
        if (status === "not_charging") return `${t('performance.not_charging', 'Not Charging')}${powerText}`;
        return "";
    };

    // Parse configured packages
    const appPackages = settings.tools.appPackage
        ? settings.tools.appPackage.split(',').map((p: string) => p.trim()).filter(Boolean)
        : [];

    const handleToggleRecording = () => {
        // If trying to start recording during a test without allowance
        if (!isRecording && isTestRunning && !allowActionsDuringTest && !forceEnable) {
            setShowHighImpactWarning(true);
            return;
        }
        toggleRecording();
    };

    if (!selectedDevice) {
        return <div className="p-8 text-center text-on-surface/80">{t('performance.select_device')}</div>;
    }

    return (
        <div ref={containerRef} className="h-full flex-1 min-h-0 flex flex-col p-4 overflow-y-auto">
            <Section
                title={t('performance.title')}
                icon={Activity}
                variant="transparent"
                status={
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={onRefresh}
                                variant="ghost"
                                size="sm"
                                className="p-1.5 hover:bg-surface-variant/30 rounded transition-all active:scale-95 h-auto"
                                data-tooltip={t('performance.refresh')}
                                data-position="left"
                            >
                                {isLoading ? (
                                    <ExpressiveLoading size="xsm" variant="circular" className="text-on-surface-variant/80" />
                                ) : (
                                    <RefreshCw size={16} className="text-on-surface-variant/80" />
                                )}
                            </Button>
                            <Button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                variant="ghost"
                                size="sm"
                                className={clsx(
                                    "text-xs px-2 py-1 rounded border transition-all active:scale-95 h-auto",
                                    autoRefresh ? "bg-primary/10 text-primary dark:text-primary/80 border-primary/20" : "bg-surface/50 text-on-surface-variant/80 border-outline-variant"
                                )}
                            >
                                {t('performance.auto', "Auto")}
                            </Button>
                        </div>

                        {!settings.paths.logcat && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-warning/10 text-warning rounded-2xl text-[11px] font-medium border border-warning/20">
                                <FolderSearch size={14} />
                                <span>{t('logcat.not_saving')}</span>
                                <Button
                                    onClick={handleConfigurePath}
                                    className="underline hover:text-warning/80 ml-1"
                                >
                                    {t('logcat.configure_path')}
                                </Button>
                                {onNavigate && (
                                    <Button
                                        onClick={() => onNavigate?.('settings')}
                                        className="flex items-center gap-1 hover:text-warning/80 ml-2 border-l border-warning/20 pl-2"
                                    >
                                        <Settings size={12} />
                                        {t('common.go_to_settings')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                }
                menus={!isNarrow ? (
                    <div className="w-48">
                        <Select
                            value={selectedPackage}
                            onChange={(e) => {
                                setSelectedPackage(e.target.value);
                                if (isRecording) toggleRecording();
                            }}
                            options={[
                                { label: t('performance.system_only', 'Entire System'), value: "" },
                                ...appPackages.map(pkg => ({ label: pkg, value: pkg }))
                            ]}
                            containerClassName="w-full"
                            leftIcon={<PackageIcon size={14} />}
                        />
                    </div>
                ) : null}
                actions={
                    <>
                        <Button
                            onClick={handleToggleRecording}
                            variant={isRecording ? "danger" : (forceEnable ? "warning" : "secondary")}
                            size="sm"
                            disabled={(isTestRunning && !allowActionsDuringTest && !forceEnable)}
                            leftIcon={isRecording ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            data-tooltip={isRecording ? t('performance.stop_record') : t('performance.start_record')}
                            data-position="left"
                        >
                            {!isNarrow && (isRecording ? `${elapsedTime}` : "REC")}
                        </Button>
                    </>
                }
            >

                {error && (
                    <div className="bg-error-container/10 text-error-container/80 p-3 rounded-2xl text-sm mb-4 border border-error-container">
                        {error}
                    </div>
                )}



                {/* Recording Feedback */}
                <FileSavedFeedback
                    path={lastSaved}
                    onClose={() => setLastSaved(null)}
                />

                {(isTestRunning && !allowActionsDuringTest && !forceEnable && !stats) ? (
                    <div className="absolute inset-0 flex-1 flex flex-col items-center justify-center text-on-surface-variant/80 text-sm p-8 text-center bg-surface/80 backdrop-blur-[2px] z-10 rounded-2xl">
                        <Activity size={48} className="opacity-20 mb-4" />
                        <h4 className="font-bold text-on-surface mb-2">{t('performance.status.paused_test', "Monitoring Paused")}</h4>
                        <p className="max-w-xs mb-6 opacity-70 italic">{t('performance.paused_description', "Performance polling is disabled to avoid interference with the running test.")}</p>

                        <Button
                            onClick={() => setShowHighImpactWarning(true)}
                            variant="secondary"
                            size="sm"
                            className="bg-warning-container/10 text-on-warning-container/80 border-warning-container/20 hover:bg-warning-container/20"
                            leftIcon={<Zap size={14} />}
                        >
                            {t('performance.actions.force_enable', 'Force Enable')}
                        </Button>
                    </div>
                ) : !stats ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-on-surface/80">
                        <ExpressiveLoading size="lg" variant="circular" className="mb-2" />
                        <p>{t('performance.loading')}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* System Stats Section */}
                        <div>
                            <button
                                onClick={() => setShowDeviceStatsSection(!showDeviceStatsSection)}
                                className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-3 ml-1 hover:text-primary transition-colors cursor-pointer w-full text-left focus:outline-none"
                            >
                                {showDeviceStatsSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                {t('performance.device_stats', 'Device Performance')}
                            </button>
                            {showDeviceStatsSection && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* CPU Card */}
                                    <Card title={t('performance.cpu')} icon={<Cpu size={24} className="text-blue-500" />}>
                                        <div className="flex items-end gap-2 mt-2">
                                            <span className="text-4xl font-bold text-on-surface/50">
                                                {formatRate(stats.cpu_usage, '%', t('performance.load'))}
                                            </span>
                                        </div>
                                        <ProgressBar value={stats.cpu_usage} max={100} color="bg-blue-500" />
                                    </Card>

                                    {/* RAM Card */}
                                    <Card title={t('performance.ram')} icon={<CircuitBoard size={24} className="text-purple-500" />}>
                                        <div className="flex items-end gap-2 mt-2">
                                            <span className="text-4xl font-bold text-on-surface/50">
                                                {formatBytes(stats.ram_used, false)}
                                            </span>
                                            <span className="text-xs text-on-surface-variant/80 mb-1">
                                                / {formatBytes(stats.ram_total)}
                                            </span>
                                        </div>
                                        <ProgressBar value={stats.ram_used} max={stats.ram_total} color="bg-purple-500" />
                                        <div className="text-xs text-right mt-1 text-on-surface/80">
                                            {((stats.ram_used / stats.ram_total) * 100).toFixed(1)}% {t('performance.used')}
                                        </div>
                                    </Card>

                                    {/* Battery Card */}
                                    <Card title={t('performance.battery')} icon={<Battery size={24} className={getBatteryColor(stats.battery_level)} />}>
                                        <div className="flex items-end gap-2 mt-2">
                                            <span className={clsx("text-4xl font-bold", getBatteryColor(stats.battery_level))} >
                                                {stats.battery_level}%
                                            </span>
                                            <span className="text-sm text-on-surface-variant/80 mb-1 font-medium">
                                                {stats.temperature.toFixed(1)}°C
                                            </span>
                                        </div>
                                        <ProgressBar value={stats.battery_level} max={100} color={getBatteryColor(stats.battery_level).replace("text-", "bg-")} />
                                        <div className="text-xs text-right mt-1 text-on-surface/80">
                                            {getBatteryStatusText(stats.battery_status || '', stats.battery_power_source || '')}
                                            {batteryEstimate && ` • ${batteryEstimate}`}
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </div>

                        {/* Check if app stats are available (only if package selected and backend returned it) */}
                        {selectedPackage && stats.app_stats && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <button
                                    onClick={() => setShowAppStatsSection(!showAppStatsSection)}
                                    className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-3 ml-1 hover:text-primary transition-colors cursor-pointer w-full text-left focus:outline-none"
                                >
                                    {showAppStatsSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    {t('performance.app_stats', 'App Performance')}: <span className="normal-case text-primary dark:text-primary/80 font-mono ml-1">{selectedPackage}</span>
                                </button>
                                {showAppStatsSection && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {/* App CPU */}
                                        <Card title={`${t('performance.cpu')} (App)`} icon={<Cpu size={24} className="text-orange-500" />}>
                                            <div className="flex items-end gap-2 mt-2">
                                                <span className="text-4xl font-bold text-on-surface/50">
                                                    {formatRate(stats.app_stats.cpu_usage, '%')}
                                                </span>
                                            </div>
                                            <ProgressBar value={stats.app_stats.cpu_usage} max={100} color="bg-orange-500" />
                                        </Card>

                                        {/* App RAM */}
                                        <Card title={`${t('performance.ram')} (App)`} icon={<CircuitBoard size={24} className="text-pink-500" />}>
                                            <div className="flex items-end gap-2 mt-2">
                                                <span className="text-4xl font-bold text-on-surface/50">
                                                    {formatBytes(stats.app_stats.ram_used)}
                                                </span>
                                            </div>
                                            {/* Using Device Total RAM as baseline for bar */}
                                            <ProgressBar value={stats.app_stats.ram_used} max={stats.ram_total} color="bg-pink-500" />
                                        </Card>

                                        {/* App FPS */}
                                        <Card title={t('performance.fps', 'FPS')} icon={<Eye size={24} className="text-success" />}>
                                            <div className="flex items-end gap-2 mt-2">
                                                <span className="text-4xl font-bold text-on-surface/50">
                                                    {formatFPS(stats.app_stats.fps)}
                                                </span>
                                            </div>
                                            <ProgressBar value={stats.app_stats.fps} max={120} color="bg-success" />
                                        </Card>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Charts Section */}
                        {history.length > 1 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex items-center justify-between mb-3 ml-1">
                                    <button
                                        onClick={() => setShowChartsSection(!showChartsSection)}
                                        className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider hover:text-primary transition-colors cursor-pointer focus:outline-none"
                                    >
                                        {showChartsSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {t('performance.history', 'Performance History')}
                                    </button>
                                    <div
                                        className={clsx(
                                            "flex items-center gap-2 px-2 py-1 rounded-xl border border-outline-variant/30 cursor-pointer transition-colors text-xs font-medium",
                                            autoRefreshCharts ? "bg-primary/10 text-primary" : "text-on-surface-variant/70 hover:bg-surface-variant/50"
                                        )}
                                        onClick={() => setAutoRefreshCharts(!autoRefreshCharts)}
                                        title={t('performance.toggle_refresh')}
                                    >
                                        <RefreshCw size={12} className={clsx(autoRefreshCharts && "animate-spin-slow")} />
                                        <span className="hidden sm:inline">{t('performance.auto', 'Auto')}</span>
                                    </div>
                                </div>
                                {showChartsSection && (
                                    <PerformanceCharts history={frozenHistory} t={t} selectedPackage={selectedPackage} />
                                )}
                            </div>
                        )}

                        {/* Process Monitor & Battery Audit Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in duration-500">
                            <button
                                onClick={() => setShowProcessMonitor(!showProcessMonitor)}
                                className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider ml-1 hover:text-primary transition-colors cursor-pointer w-full text-left focus:outline-none"
                            >
                                {showProcessMonitor ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <ListTree size={14} className="text-primary ml-1" />
                                <span className="ml-1">{t('performance.process_monitor', 'Process Monitor')}</span>
                            </button>
                            <button
                                onClick={() => {
                                    if (!showBatteryAudit && !batteryAuditData) fetchBatteryAudit();
                                    setShowBatteryAudit(!showBatteryAudit);
                                }}
                                className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider ml-1 hover:text-primary transition-colors cursor-pointer w-full text-left focus:outline-none"
                            >
                                {showBatteryAudit ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Battery size={14} className="text-primary ml-1" />
                                <span className="ml-1">{t('performance.battery_audit', 'Battery Audit')}</span>
                            </button>
                        </div>
                        <div className={clsx("grid grid-cols-1 gap-4 animate-in fade-in duration-500", showProcessMonitor && showBatteryAudit && "lg:grid-cols-2")} >
                            {/* Process Monitor */}
                            <div>

                                {showProcessMonitor && (
                                    <Section
                                        title={t('performance.running_processes', 'Running Processes')}
                                        icon={ListTree}
                                        actions={
                                            <>
                                                <div
                                                    className={clsx(
                                                        "flex items-center gap-2 px-2 py-1 rounded-xl border border-outline-variant/30 cursor-pointer transition-colors text-xs font-medium",
                                                        autoRefreshProcessMonitor ? "bg-primary/10 text-primary" : "text-on-surface-variant/70 hover:bg-surface-variant/50"
                                                    )}
                                                    onClick={() => setAutoRefreshProcessMonitor(!autoRefreshProcessMonitor)}
                                                    title={t('performance.toggle_refresh')}
                                                >
                                                    <RefreshCw size={12} className={clsx(autoRefreshProcessMonitor && "animate-spin-slow")} />
                                                    <span className="hidden sm:inline">{t('performance.auto', 'Auto')}</span>
                                                </div>
                                            </>
                                        }
                                    >
                                        <div className="flex flex-col h-[400px] w-full mt-2 bg-surface/30 rounded-xl border border-outline-variant/30 overflow-hidden backdrop-blur-sm">
                                            {/* Table Header */}
                                            <div className="flex items-center p-3 border-b border-outline-variant/50 text-xs font-semibold text-on-surface-variant bg-surface/50">
                                                <div
                                                    className="w-16 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                                                    onClick={() => processMonitor.handleSort('pid')}
                                                >
                                                    PID {processMonitor.sortField === 'pid' && (processMonitor.sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                                </div>
                                                <div
                                                    className="flex-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                                                    onClick={() => processMonitor.handleSort('name')}
                                                >
                                                    {t('performance.process_name', 'Process Name')} {processMonitor.sortField === 'name' && (processMonitor.sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                                </div>
                                                <div
                                                    className="w-20 text-right cursor-pointer hover:text-primary transition-colors flex items-center justify-end gap-1"
                                                    onClick={() => processMonitor.handleSort('cpu')}
                                                >
                                                    CPU % {processMonitor.sortField === 'cpu' && (processMonitor.sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                                </div>
                                                <div
                                                    className="w-24 text-right cursor-pointer hover:text-primary transition-colors flex items-center justify-end gap-1"
                                                    onClick={() => processMonitor.handleSort('mem')}
                                                >
                                                    RAM {processMonitor.sortField === 'mem' && (processMonitor.sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                                </div>
                                            </div>

                                            {/* Virtualized List */}
                                            <div className="flex-1 min-h-0">
                                                {processMonitor.error ? (
                                                    <div className="p-4 text-center text-error/80 text-sm">
                                                        {t('performance.process_error', 'Failed to fetch process stats')}: {processMonitor.error}
                                                    </div>
                                                ) : processMonitor.processes.length === 0 ? (
                                                    <div className="p-8 text-center flex flex-col items-center">
                                                        <ExpressiveLoading size="sm" variant="circular" />
                                                        <span className="text-xs text-on-surface-variant/80 mt-2">{t('common.loading', 'Loading...')}</span>
                                                    </div>
                                                ) : (
                                                    <Virtuoso
                                                        data={processMonitor.processes}
                                                        className="h-full w-full custom-scrollbar"
                                                        itemContent={(_, p) => (
                                                            <div className="flex items-center p-3 border-b border-outline-variant/10 text-sm hover:bg-surface-variant/20 transition-colors">
                                                                <div className="w-16 font-mono text-xs opacity-70">{p.pid}</div>
                                                                <div className="flex-1 truncate pr-4 font-medium" title={p.command}>{p.command}</div>
                                                                <div className="w-20 text-right font-mono text-xs text-tertiary">{p.cpu.toFixed(1)}%</div>
                                                                <div className="w-24 text-right font-mono text-xs text-secondary">{(p.mem / 1024).toFixed(1)} MB</div>
                                                            </div>
                                                        )}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </Section>
                                )}
                            </div>

                            {/* Battery Audit */}
                            <div>

                                {showBatteryAudit && (
                                    <Section
                                        title={t('performance.battery_audit', 'Battery Audit')}
                                        icon={Battery}
                                        actions={
                                            <>
                                                {batteryAuditLastUpdate && (
                                                    <span className="text-[10px] text-on-surface-variant/60 font-mono tracking-tighter">
                                                        {t('performance.last_update', 'Last update')}: {new Date(batteryAuditLastUpdate).toLocaleTimeString()}
                                                    </span>
                                                )}
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={fetchBatteryAudit}
                                                    disabled={isBatteryAuditLoading}
                                                    leftIcon={<RefreshCw size={14} className={clsx(isBatteryAuditLoading && "animate-spin")} />}
                                                >
                                                    {t('common.refresh', 'Refresh')}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={resetBatteryAudit}
                                                    disabled={isBatteryAuditLoading}
                                                    leftIcon={<Square size={14} />}
                                                >
                                                    {t('performance.reset_stats', 'Reset')}
                                                </Button>
                                            </>
                                        }
                                    >
                                        <div className="flex flex-col h-[400px] w-full mt-2 overflow-y-auto custom-scrollbar">
                                            {isBatteryAuditLoading && !batteryAuditData ? (
                                                <div className="flex-1 flex flex-col items-center justify-center border border-outline-variant/30 rounded-xl bg-surface/30">
                                                    <ExpressiveLoading size="sm" variant="circular" />
                                                </div>
                                            ) : batteryAuditData ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-4 p-3 rounded-lg bg-surface-variant/30 border border-outline-variant/20 mb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs text-on-surface-variant/70 uppercase font-semibold">{t('performance.capacity', 'Capacity')}</span>
                                                            <span className="font-mono text-sm">{batteryAuditData.capacity} mAh</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs text-on-surface-variant/70 uppercase font-semibold">{t('performance.computed_drain', 'Computed Drain')}</span>
                                                            <span className="font-mono text-sm">{batteryAuditData.computed_drain} mAh</span>
                                                        </div>
                                                    </div>

                                                    {batteryAuditData.apps.length > 0 ? (
                                                        batteryAuditData.apps.map((app, i) => (
                                                            <div key={i} className="flex flex-col p-3 rounded-lg border border-outline-variant/20 hover:border-primary/30 hover:bg-surface-variant/20 transition-all">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-semibold text-sm truncate pr-2 text-on-surface-variant/90">{app.name}</span>
                                                                    <span className="font-mono text-xs text-tertiary font-medium whitespace-nowrap">{app.usage.toFixed(4)} mAh</span>
                                                                </div>
                                                                {app.uid !== app.name && <span className="text-[10px] text-on-surface-variant/50 font-mono mt-0.5">{app.uid}</span>}
                                                                {app.details && (
                                                                    <span className="text-[10px] text-on-surface-variant/70 mt-1.5 break-words font-mono opacity-80 leading-tight">
                                                                        {app.details}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="p-8 text-center text-sm text-on-surface-variant/60">{t('performance.no_app_data', 'No app specific data available.')}</div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant/60 border border-outline-variant/30 rounded-xl bg-surface/30">
                                                    {t('common.no_data', 'No data')}
                                                </div>
                                            )}
                                        </div>
                                    </Section>
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </Section>

            <WarningModal
                isOpen={showHighImpactWarning}
                onClose={() => setShowHighImpactWarning(false)}
                onConfirm={() => {
                    setShowHighImpactWarning(false);
                    if (setForceEnable) {
                        setForceEnable(true);
                        feedback.toast.info('performance.force_enabled_msg');
                    }
                }}
                title={t('performance.warning_high_impact_title', "High Impact Warning")}
                description={
                    <div className="space-y-3">
                        <p className="text-warning font-bold flex items-center gap-2">
                            <AlertTriangle size={18} />
                            {t('performance.warning_high_impact', "Activating monitoring during a test can cause ADB congestion and lead to execution failures (Socket Hang Up).")}
                        </p>
                        <p className="text-sm opacity-70">
                            {t('performance.warning_high_impact_detail', "Proceed only if investigation of performance issues is strictly necessary.")}
                        </p>
                    </div>
                }
                confirmText={t('performance.actions.force_enable', "Force Enable")}
                variant="danger"
            />
        </div>
    );
});

function Card({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
    return (
        <div className="bg-surface/50 border border-outline-variant/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 opacity-80">
                <span className="font-medium text-on-surface-variant/80">{title}</span>
                {icon}
            </div>
            {children}
        </div>
    );
}

function ProgressBar({ value, max, color }: { value: number, max: number, color: string }) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className="w-full bg-outline-variant rounded-2xl h-2.5 mt-4 overflow-hidden">
            <div
                className={clsx("h-2.5 rounded-2xl transition-all duration-500 ease-out", color)}
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
    );
}


const PerformanceCharts = React.memo(({ history, t, selectedPackage }: { history: any[], t: any, selectedPackage: string }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={t('performance.general_history', 'System History')} icon={<Activity size={20} className="text-primary" />}>
                <div className="h-64 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorSysRam" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSysCpu" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorBattery" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="timestamp" tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })} stroke="currentColor" className="text-[10px] opacity-50" />
                            <YAxis yAxisId="left" stroke="currentColor" className="text-[10px] opacity-50" tickFormatter={(val) => (val / 1024).toFixed(0)} />
                            <YAxis yAxisId="right" orientation="right" stroke="currentColor" className="text-[10px] opacity-50" domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" vertical={false} />
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-outline-variant)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-on-surface)' }}
                                labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                                formatter={(value: any, name: any) => {
                                    if (name === 'ram_used') return [(Number(value) / 1024).toFixed(1) + ' MB', t('performance.system_ram', 'System RAM')];
                                    if (name === 'cpu_usage') return [Number(value).toFixed(1) + '%', t('performance.cpu', 'CPU')];
                                    if (name === 'battery_level') return [Number(value).toFixed(0) + '%', t('performance.battery', 'Battery')];
                                    return [value, name];
                                }}
                            />
                            <Area yAxisId="left" type="monotone" dataKey="ram_used" stroke="#a855f7" fillOpacity={1} fill="url(#colorSysRam)" isAnimationActive={false} name="ram_used" />
                            <Area yAxisId="right" type="monotone" dataKey="cpu_usage" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSysCpu)" isAnimationActive={false} name="cpu_usage" />
                            <Area yAxisId="right" type="monotone" dataKey="battery_level" stroke="#22c55e" fillOpacity={1} fill="url(#colorBattery)" isAnimationActive={false} name="battery_level" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {selectedPackage && (
                <Card title={t('performance.app_history', 'App History')} icon={<PackageIcon size={20} className="text-secondary" />}>
                    <div className="h-64 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorAppRam" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAppCpu" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAppFps" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="timestamp" tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })} stroke="currentColor" className="text-[10px] opacity-50" />
                                <YAxis yAxisId="left" stroke="currentColor" className="text-[10px] opacity-50" tickFormatter={(val) => (val / 1024).toFixed(0)} />
                                <YAxis yAxisId="right" orientation="right" stroke="currentColor" className="text-[10px] opacity-50" domain={[0, 120]} />
                                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" vertical={false} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-outline-variant)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-on-surface)' }}
                                    labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                                    formatter={(value: any, name: any) => {
                                        if (name === 'app_stats.ram_used') return [(Number(value) / 1024).toFixed(1) + ' MB', t('performance.app_ram', 'App RAM')];
                                        if (name === 'app_stats.cpu_usage') return [Number(value).toFixed(1) + '%', t('performance.cpu', 'CPU')];
                                        if (name === 'app_stats.fps') return [Math.round(Number(value)) + ' fps', t('performance.fps', 'FPS')];
                                        return [value, name];
                                    }}
                                />
                                <Area yAxisId="left" type="monotone" dataKey="app_stats.ram_used" stroke="#ec4899" fillOpacity={1} fill="url(#colorAppRam)" isAnimationActive={false} name="app_stats.ram_used" />
                                <Area yAxisId="right" type="monotone" dataKey="app_stats.cpu_usage" stroke="#f97316" fillOpacity={1} fill="url(#colorAppCpu)" isAnimationActive={false} name="app_stats.cpu_usage" />
                                <Area yAxisId="right" type="monotone" dataKey="app_stats.fps" stroke="#22c55e" fillOpacity={1} fill="url(#colorAppFps)" isAnimationActive={false} name="app_stats.fps" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.history === nextProps.history && prevProps.selectedPackage === nextProps.selectedPackage;
});
