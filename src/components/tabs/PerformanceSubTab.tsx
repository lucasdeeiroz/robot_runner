import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Cpu, Battery, CircuitBoard, RefreshCw, Play, Square, Package as PackageIcon, Eye } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings";

import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { Section } from "@/components/organisms/Section";
import { DeviceStats } from "@/hooks/usePerformanceRecorder";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";

interface PerformanceSubTabProps {
    selectedDevice: string;
    stats: DeviceStats | null;
    error: string | null;
    autoRefresh: boolean;
    setAutoRefresh: (val: boolean) => void;
    selectedPackage: string;
    setSelectedPackage: (val: string) => void;
    isRecording: boolean;
    toggleRecording: () => void;
    lastSaved: string | null;
    setLastSaved: (val: string | null) => void;

    onRefresh: () => void;
}

export function PerformanceSubTab({
    selectedDevice,
    stats,
    error,
    autoRefresh,
    setAutoRefresh,
    selectedPackage,
    setSelectedPackage,
    isRecording,
    toggleRecording,
    lastSaved,
    setLastSaved,

    onRefresh
}: PerformanceSubTabProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();

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

    const formatBytes = (kb: number, showUnit: boolean = true) => {
        if (!kb || kb === 0) return t('performance.na', 'N/A');
        if (kb > 1024 * 1024) return <>{(kb / (1024 * 1024)).toFixed(1)} {showUnit && <span className="text-sm text-on-surface-variant/80 font-normal">GB</span>}</>;
        if (kb > 1024) return <>{(kb / 1024).toFixed(1)} {showUnit && <span className="text-sm text-on-surface-variant/80 font-normal">MB</span>}</>;
        return <>{kb} {showUnit && <span className="text-sm text-on-surface-variant/80 font-normal">KB</span>}</>;
    };

    const formatRate = (val: number, unit: string, additional?: string) => {
        if (!val || val === 0) return t('performance.na', 'N/A');
        return <>{val.toFixed(1)} <span className="text-sm text-on-surface-variant/80 font-normal">{unit} {additional}</span></>;
    };

    const formatFPS = (val: number) => {
        if (!val || val === 0) return t('performance.na', 'N/A');
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

    if (!selectedDevice) {
        return <div className="p-8 text-center text-on-surface/80">{t('performance.select_device')}</div>;
    }

    return (
        <div ref={containerRef} className="h-full flex flex-col p-4 overflow-y-auto">
            <Section
                title={t('performance.title')}
                icon={Activity}
                variant="transparent"
                status={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRefresh}
                            className="p-1.5 hover:bg-surface-variant/30 rounded transition-all active:scale-95"
                            title={t('performance.refresh')}
                        >
                            <RefreshCw size={16} className="text-on-surface-variant/80" />
                        </button>
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={clsx(
                                "text-xs px-2 py-1 rounded border transition-all active:scale-95",
                                autoRefresh ? "bg-primary/10 text-primary border-primary/20" : "bg-surface/50 text-on-surface-variant/80 border-outline-variant"
                            )}
                        >
                            {t('performance.auto', "Auto")}
                        </button>
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
                            onClick={toggleRecording}
                            variant={isRecording ? "danger" : "secondary"}
                            size="sm"
                            leftIcon={isRecording ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            title={isRecording ? t('performance.stop_record') : t('performance.start_record')}
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

                {!stats ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-on-surface/80 animate-pulse">
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
                                    {t('performance.app_stats', 'App Performance')}: <span className="normal-case text-primary font-mono">{selectedPackage}</span>
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
                                    <Card title="FPS" icon={<Eye size={24} className="text-success" />}>
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
                    </div>
                )}
            </Section>
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
