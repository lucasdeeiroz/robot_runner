import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";

export interface AppStats {
    cpu_usage: number;
    ram_used: number;
    fps: number;
}

export interface DeviceStats {
    cpu_usage: number;
    ram_used: number;
    ram_total: number;
    battery_level: number;
    temperature: number;
    app_stats?: AppStats;
}

export function usePerformanceRecorder(selectedDevice: string, isActive: boolean) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [stats, setStats] = useState<DeviceStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedPackage, setSelectedPackage] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);

    // Recording State
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingPath, setRecordingPath] = useState<string | null>(null);

    // Fetch Stats Loop
    useEffect(() => {
        let interval: NodeJS.Timeout;
        // Update if active AND auto-refresh is on, OR if recording (regardless of visibility)
        const shouldUpdate = selectedDevice && ((autoRefresh && isActive) || isRecording);

        if (shouldUpdate) {
            fetchStats();
            interval = setInterval(fetchStats, 2000); // Poll every 2s
        }
        return () => clearInterval(interval);
    }, [selectedDevice, autoRefresh, selectedPackage, isActive, isRecording]);

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const data = await invoke<DeviceStats>('get_device_stats', {
                device: selectedDevice,
                package: selectedPackage || null
            });
            setStats(data);
            setError(null);
        } catch (e) {
            feedback.toast.error("performance.fetch_error", e);
            setError(t('performance.error'));
        } finally {
            setIsLoading(false);
        }
    };

    // Recording Logic - Append Data
    useEffect(() => {
        if (isRecording && stats && recordingPath) {
            let line = `${new Date().toISOString()},${stats.cpu_usage.toFixed(2)},${stats.ram_used},${stats.battery_level},${stats.temperature.toFixed(1)}`;

            // Add App stats if present
            if (stats.app_stats) {
                line += `,${stats.app_stats.cpu_usage.toFixed(2)},${stats.app_stats.ram_used},${stats.app_stats.fps}`;
            } else {
                line += ",,,"; // Empty placeholders
            }
            line += "\n";

            invoke('save_file', { path: recordingPath, content: line, append: true })
                .catch(e => feedback.toast.error("performance.save_error", e));
        }
    }, [stats, isRecording, recordingPath]);

    const toggleRecording = async () => {
        if (isRecording) {
            if (recordingPath) {
                // Just notify stopped, file is already written incrementally
                setLastSaved(recordingPath);
                feedback.toast.success('feedback.performance_saved');
            }
            setIsRecording(false);
            setRecordingPath(null);
        } else {
            // Start Recording: Create File
            const header = "Timestamp,System_CPU_%,System_RAM_KB,Battery_%,Battery_Temp_C" +
                (selectedPackage ? ",App_CPU_%,App_RAM_KB,FPS" : "") + "\n";

            try {
                let savePath = "";
                const filename = `performance_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

                if (settings.paths.logs) {
                    savePath = await join(settings.paths.logs, filename);
                } else {
                    // Fallback: use save dialog when no log path is configured.
                    const selected = await save({
                        filters: [{ name: 'CSV', extensions: ['csv'] }],
                        defaultPath: filename
                    });
                    if (selected) savePath = selected;
                }

                if (savePath) {
                    await invoke('save_file', { path: savePath, content: header, append: false });
                    setRecordingPath(savePath);
                    setIsRecording(true);
                    setLastSaved(null);
                    feedback.toast.success('feedback.recording_started');
                }
            } catch (e) {
                feedback.toast.error("performance.record_error", e);
            }
        }
    };

    return {
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
        fetchStats,
        isLoading
    };
}
