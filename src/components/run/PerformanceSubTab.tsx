import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Activity, Cpu, Battery, CircuitBoard, RefreshCw, Play, Square, Package as PackageIcon, Eye } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings";

interface PerformanceSubTabProps {
    selectedDevice: string;
}

interface AppStats {
    cpu_usage: number;
    ram_used: number;
    fps: number;
}

interface DeviceStats {
    cpu_usage: number;
    ram_used: number;
    ram_total: number;
    battery_level: number;
    app_stats?: AppStats;
}

export function PerformanceSubTab({ selectedDevice }: PerformanceSubTabProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [stats, setStats] = useState<DeviceStats | null>(null);
    // const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedPackage, setSelectedPackage] = useState<string>("");

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingPath, setRecordingPath] = useState<string | null>(null);
    const [lastRecording, setLastRecording] = useState<string | null>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (selectedDevice && autoRefresh) {
            fetchStats();
            interval = setInterval(fetchStats, 2000); // Poll every 2s
        }
        return () => clearInterval(interval);
    }, [selectedDevice, autoRefresh, selectedPackage]);

    // Recording Logic
    useEffect(() => {
        if (isRecording && stats && recordingPath) {
            let line = `${new Date().toISOString()},${stats.cpu_usage.toFixed(2)},${stats.ram_used},${stats.battery_level}`;

            // Add App stats if present
            if (stats.app_stats) {
                line += `,${stats.app_stats.cpu_usage.toFixed(2)},${stats.app_stats.ram_used},${stats.app_stats.fps}`;
            } else {
                line += ",,,"; // Empty placeholders
            }
            line += "\n";

            invoke('save_file', { path: recordingPath, content: line, append: true })
                .catch(e => console.error("Failed to save perf data", e));
        }
    }, [stats, isRecording, recordingPath]);

    const fetchStats = async () => {
        try {
            const data = await invoke<DeviceStats>('get_device_stats', {
                device: selectedDevice,
                package: selectedPackage || null
            });
            setStats(data);
            setError(null);
        } catch (e) {
            console.error("Failed to fetch stats:", e);
            setError(t('performance.error'));
        }
    };

    const toggleRecording = async () => {
        if (isRecording) {
            if (recordingPath) setLastRecording(recordingPath);
            setIsRecording(false);
            setRecordingPath(null);
        } else {
            setLastRecording(null);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeDeviceName = selectedDevice.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `performance_${safeDeviceName}_${timestamp}.csv`;
            const dir = settings.paths.logs || ".";
            const path = dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${filename}` : `${dir}/${filename}`;

            try {
                // Header based on selection
                let header = "Timestamp,System_CPU_%,System_RAM_KB,Battery_%";
                if (selectedPackage) {
                    header += `,App_CPU_%,App_RAM_KB,FPS`;
                }
                header += "\n";

                await invoke('save_file', { path, content: header, append: false });
                setRecordingPath(path);
                setIsRecording(true);
            } catch (e) {
                setError(t('performance.record_error') + ": " + e);
            }
        }
    };

    const formatBytes = (kb: number) => {
        if (kb > 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
        if (kb > 1024) return `${(kb / 1024).toFixed(2)} MB`;
        return `${kb} KB`;
    };

    const getBatteryColor = (level: number) => {
        if (level > 20) return "text-green-500";
        if (level > 10) return "text-yellow-500";
        return "text-red-500";
    };

    // Parse configured packages
    const appPackages = settings.tools.appPackage
        ? settings.tools.appPackage.split(',').map((p: string) => p.trim()).filter(Boolean)
        : [];

    if (!selectedDevice) {
        return <div className="p-8 text-center text-zinc-400">{t('performance.select_device')}</div>;
    }

    return (
        <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-medium flex items-center gap-2">
                        <Activity size={20} className="text-blue-500" />
                        {t('performance.title')}
                    </h2>


                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleRecording}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 border",
                            isRecording
                                ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 shadow-sm"
                                : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 shadow-sm"
                        )}
                        title={isRecording ? t('performance.stop_record') : t('performance.start_record')}
                    >
                        {isRecording ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        {isRecording ? t('performance.recording') : "REC"}
                    </button>

                    {/* Package Selector */}
                    <div className="relative">
                        <select
                            value={selectedPackage}
                            onChange={(e) => {
                                setSelectedPackage(e.target.value);
                                if (isRecording) toggleRecording();
                            }}
                            className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl py-1.5 pl-8 pr-8 text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500/30 outline-none transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
                        >
                            <option value="">{t('performance.system_only', 'System Only')}</option>
                            {appPackages.map(pkg => (
                                <option key={pkg} value={pkg}>{pkg}</option>
                            ))}
                        </select>
                        <PackageIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>

                    <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={clsx(
                            "text-xs px-2 py-1 rounded-lg border transition-all active:scale-95",
                            autoRefresh ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                        )}
                    >
                        {autoRefresh ? t('performance.auto_on') : t('performance.auto_off')}
                    </button>
                    <button
                        onClick={fetchStats}
                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95"
                        title={t('performance.refresh')}
                    >
                        <RefreshCw size={16} className="text-zinc-500" />
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm mb-4 border border-red-100 dark:border-red-900/50">
                    {error}
                </div>
            )}

            {lastRecording && (
                <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-3 rounded-md text-sm mb-4 border border-green-100 dark:border-green-900/50 flex items-center gap-2">
                    <span>{t('performance.saved', 'Recorded saved to:')}</span>
                    <span
                        className="underline cursor-pointer hover:text-green-900 dark:hover:text-green-100 font-mono break-all"
                        onClick={() => invoke('open_path', { path: lastRecording })}
                        title={t('common.open_file', "Click to open file")}
                    >
                        {lastRecording}
                    </span>
                </div>
            )}

            {!stats ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 animate-pulse">
                    <p>{t('performance.loading')}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* System Stats Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 ml-1">{t('performance.device_stats', 'Device Performance')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* CPU Card */}
                            <Card title={t('performance.cpu')} icon={<Cpu size={24} className="text-blue-500" />}>
                                <div className="flex items-end gap-2 mt-2">
                                    <span className="text-4xl font-bold text-zinc-800 dark:text-zinc-100">
                                        {stats.cpu_usage.toFixed(1)}%
                                    </span>
                                    <span className="text-sm text-zinc-500 mb-1">{t('performance.load')}</span>
                                </div>
                                <ProgressBar value={stats.cpu_usage} max={100} color="bg-blue-500" />
                            </Card>

                            {/* RAM Card */}
                            <Card title={t('performance.ram')} icon={<CircuitBoard size={24} className="text-purple-500" />}>
                                <div className="flex items-end gap-2 mt-2">
                                    <span className="text-3xl font-bold text-zinc-800 dark:text-zinc-100">
                                        {formatBytes(stats.ram_used)}
                                    </span>
                                    <span className="text-xs text-zinc-500 mb-1">
                                        / {formatBytes(stats.ram_total)}
                                    </span>
                                </div>
                                <ProgressBar value={stats.ram_used} max={stats.ram_total} color="bg-purple-500" />
                                <div className="text-xs text-right mt-1 text-zinc-400">
                                    {((stats.ram_used / stats.ram_total) * 100).toFixed(1)}% {t('performance.used')}
                                </div>
                            </Card>

                            {/* Battery Card */}
                            <Card title={t('performance.battery')} icon={<Battery size={24} className={getBatteryColor(stats.battery_level)} />}>
                                <div className="flex items-end gap-2 mt-2">
                                    <span className={clsx("text-4xl font-bold", getBatteryColor(stats.battery_level))}>
                                        {stats.battery_level}%
                                    </span>
                                </div>
                                <ProgressBar value={stats.battery_level} max={100} color={getBatteryColor(stats.battery_level).replace("text-", "bg-")} />
                            </Card>
                        </div>
                    </div>

                    {/* Check if app stats are available (only if package selected and backend returned it) */}
                    {selectedPackage && stats.app_stats && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                                {t('performance.app_stats', 'App Performance')}: <span className="normal-case text-blue-600 dark:text-blue-400 font-mono">{selectedPackage}</span>
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* App CPU */}
                                <Card title={`${t('performance.cpu')} (App)`} icon={<Cpu size={24} className="text-orange-500" />}>
                                    <div className="flex items-end gap-2 mt-2">
                                        <span className="text-4xl font-bold text-zinc-800 dark:text-zinc-100">
                                            {stats.app_stats.cpu_usage.toFixed(1)}%
                                        </span>
                                    </div>
                                    <ProgressBar value={stats.app_stats.cpu_usage} max={100} color="bg-orange-500" />
                                </Card>

                                {/* App RAM */}
                                <Card title={`${t('performance.ram')} (App)`} icon={<CircuitBoard size={24} className="text-pink-500" />}>
                                    <div className="flex items-end gap-2 mt-2">
                                        <span className="text-3xl font-bold text-zinc-800 dark:text-zinc-100">
                                            {formatBytes(stats.app_stats.ram_used)}
                                        </span>
                                    </div>
                                    {/* Using Device Total RAM as baseline for bar */}
                                    <ProgressBar value={stats.app_stats.ram_used} max={stats.ram_total} color="bg-pink-500" />
                                </Card>

                                {/* App FPS */}
                                <Card title="FPS" icon={<Eye size={24} className="text-green-500" />}>
                                    <div className="flex items-end gap-2 mt-2">
                                        <span className="text-4xl font-bold text-zinc-800 dark:text-zinc-100">
                                            {stats.app_stats.fps}
                                        </span>
                                        <span className="text-sm text-zinc-500 mb-1">fps</span>
                                    </div>
                                    <ProgressBar value={stats.app_stats.fps} max={120} color="bg-green-500" />
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Card({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
    return (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 opacity-80">
                <span className="font-medium text-zinc-600 dark:text-zinc-300">{title}</span>
                {icon}
            </div>
            {children}
        </div>
    );
}

function ProgressBar({ value, max, color }: { value: number, max: number, color: string }) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2.5 mt-4 overflow-hidden">
            <div
                className={clsx("h-2.5 rounded-full transition-all duration-500 ease-out", color)}
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
    );
}
