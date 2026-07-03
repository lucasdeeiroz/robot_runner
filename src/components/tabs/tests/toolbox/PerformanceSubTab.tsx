import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Activity, Cpu, Battery, CircuitBoard, Play, Square, Package as PackageIcon, Eye, RefreshCw, Zap, FolderSearch, Settings } from "lucide-react";
import clsx from "clsx";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";
import { WarningModal } from "@/components/organisms/WarningModal";

import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { Section } from "@/components/organisms/Section";
import { DeviceStats } from "@/hooks/usePerformanceRecorder";
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

export function PerformanceSubTab({
    selectedDevice,
    stats,
    history,
    error,
    autoRefresh,
    setAutoRefresh,
    selectedPackage,
    setSelectedPackage,
    isRecording,
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
                            {!isNarrow && (isRecording ? t('performance.recording') : "REC")}
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
                            <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-3 ml-1">{t('performance.device_stats', 'Device Performance')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* CPU Card */}
                                <Card title={t('performance.cpu')} icon={<Cpu size={24} className="text-primary" />}>
                                    <div className="flex items-end gap-2 mt-2">
                                        <span className="text-4xl font-bold text-on-surface/50">
                                            {formatRate(stats.cpu_usage, '%', t('performance.load'))}
                                        </span>
                                    </div>
                                    <ProgressBar value={stats.cpu_usage} max={100} color="bg-primary" />
                                </Card>

                                {/* RAM Card */}
                                <Card title={t('performance.ram')} icon={<CircuitBoard size={24} className="text-purple-500" />}>
                                    <div className="flex items-end gap-2 mt-2">
                                        <span className="text-3xl font-bold text-on-surface/50">
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
                                        <span className={clsx("text-4xl font-bold", getBatteryColor(stats.battery_level))}>
                                            {stats.battery_level}%
                                        </span>
                                        <span className="text-sm text-on-surface-variant/80 mb-1 font-medium">
                                            {stats.temperature.toFixed(1)}°C
                                        </span>
                                    </div>
                                    <ProgressBar value={stats.battery_level} max={100} color={getBatteryColor(stats.battery_level).replace("text-", "bg-")} />
                                </Card>
                            </div>
                        </div>

                        {/* Check if app stats are available (only if package selected and backend returned it) */}
                        {selectedPackage && stats.app_stats && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                                    {t('performance.app_stats', 'App Performance')}: <span className="normal-case text-primary dark:text-primary/80 font-mono">{selectedPackage}</span>
                                </h3>
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
                                            <span className="text-3xl font-bold text-on-surface/50">
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
                            </div>
                        )}

                        {/* Charts Section */}
                        {history.length > 1 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
                                <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-3 ml-1">{t('performance.history', 'Performance History')}</h3>
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
                                        <Card title={t('performance.app_history', 'App History')} icon={<PackageIcon size={20} className="text-pink-500" />}>
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
                            </div>
                        )}


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
}

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
