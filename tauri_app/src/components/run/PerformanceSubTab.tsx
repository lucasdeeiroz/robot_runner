import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Activity, Cpu, Battery, CircuitBoard, RefreshCw, Play, Square } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings";

interface PerformanceSubTabProps {
    selectedDevice: string;
}

interface DeviceStats {
    cpu_usage: number;
    ram_used: number;
    ram_total: number;
    battery_level: number;
}

export function PerformanceSubTab({ selectedDevice }: PerformanceSubTabProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [stats, setStats] = useState<DeviceStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingPath, setRecordingPath] = useState<string | null>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (selectedDevice && autoRefresh) {
            fetchStats();
            interval = setInterval(fetchStats, 2000); // Poll every 2s
        }
        return () => clearInterval(interval);
    }, [selectedDevice, autoRefresh]);

    // Recording Logic: Save data when stats update and recording is active
    useEffect(() => {
        if (isRecording && stats && recordingPath) {
            const line = `${new Date().toISOString()},${stats.cpu_usage.toFixed(2)},${stats.ram_used},${stats.battery_level}\n`;
            invoke('save_file', { path: recordingPath, content: line, append: true })
                .catch(e => console.error("Failed to save perf data", e));
        }
    }, [stats, isRecording, recordingPath]);

    const fetchStats = async () => {
        try {
            const data = await invoke<DeviceStats>('get_device_stats', { device: selectedDevice });
            setStats(data);
            setError(null);
        } catch (e) {
            console.error("Failed to fetch stats:", e);
            setError(t('performance.error'));
        }
    };

    const toggleRecording = async () => {
        if (isRecording) {
            setIsRecording(false);
            setRecordingPath(null);
        } else {
            // Start recording
            // Filename: performance_<device>_<timestamp>.csv
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeDeviceName = selectedDevice.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `performance_${safeDeviceName}_${timestamp}.csv`;

            // Use configured logcat path or default logic
            // Note: settings.paths.logs is usually set to a valid directory.
            // If user has a specific "logcat" folder configured, we should use it.
            // Assuming settings structure has it or we default to logs.
            // Current settings implementation might only have 'logs' path widely used.
            const dir = settings.paths.logs || ".";
            // Ensure separator.
            const path = dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${filename}` : `${dir}/${filename}`;

            try {
                // Write Header
                const header = "Timestamp,CPU_%,RAM_KB,Battery_%\n";
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

    if (!selectedDevice) {
        return <div className="p-8 text-center text-zinc-400">{t('performance.select_device')}</div>;
    }

    return (
        <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium flex items-center gap-2">
                    <Activity size={20} className="text-blue-500" />
                    {t('performance.title')}
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleRecording}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all border",
                            isRecording
                                ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
                                : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 shadow-sm"
                        )}
                        title={isRecording ? t('performance.stop_record') : t('performance.start_record')}
                    >
                        {isRecording ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        {isRecording ? t('performance.recording') : "REC"}
                    </button>

                    <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={clsx(
                            "text-xs px-2 py-1 rounded border transition-colors",
                            autoRefresh ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                        )}
                    >
                        {autoRefresh ? t('performance.auto_on') : t('performance.auto_off')}
                    </button>
                    <button
                        onClick={fetchStats}
                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
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

            {!stats ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 animate-pulse">
                    <p>{t('performance.loading')}</p>
                </div>
            ) : (
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
