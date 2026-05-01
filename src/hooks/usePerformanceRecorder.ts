import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { feedback } from "@/lib/feedback";
import { useFileSave } from "./useFileSave";

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
    foreground_activity?: string;
}

export function usePerformanceRecorder(
    selectedDevice: string,
    isActive: boolean,
    isTestRunning: boolean = false,
    initialAutoRefresh: boolean = true,
    allowActionsDuringTest: boolean = false
) {
    const { t } = useTranslation();
    const [stats, setStats] = useState<DeviceStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh);
    const [selectedPackage, setSelectedPackage] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [forceEnable, setForceEnable] = useState(false);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);


    const { saveFile, lastSavedPath: lastSaved, clearFeedback } = useFileSave({
        fileType: 'CSV',
        extensions: ['csv'],
        defaultNamePrefix: 'performance',
        settingPathKey: 'logcat' // As requested: save to logcat directory
    });

    // Use a ref to always call the latest fetchStats function and avoid stale closures
    const fetchStatsRef = useRef<(() => Promise<void>) | null>(null);

    const fetchStats = async () => {
        if (isLoading) return; // Prevent stacking requests

        setIsLoading(true);
        try {
            const data = await invoke<DeviceStats>('get_device_stats', {
                device: selectedDevice,
                package: selectedPackage || null
            });
            setStats(data);
            setError(null);
        } catch (e) {
            if (!isTestRunning) { // Suppress errors during tests to avoid spamming the UI if ADB is busy
                feedback.toast.error("performance.fetch_error", e);
            }
            setError(t('performance.error'));
        } finally {
            setIsLoading(false);
        }
    };

    // Keep the ref updated with the latest fetchStats
    useEffect(() => {
        fetchStatsRef.current = fetchStats;
    }, [fetchStats]);

    // Fetch Stats Loop
    useEffect(() => {
        let interval: NodeJS.Timeout;

        // Condition to fetch data:
        // 1. Device selected AND
        // 2. (Auto-refresh + Active Screen OR Recording) AND
        // 3. (Not a test OR allowActionsDuringTest OR forceEnable)
        const canUpdateDuringTest = allowActionsDuringTest || forceEnable;
        const shouldUpdate = selectedDevice &&
            ((autoRefresh && isActive) || isRecording) &&
            (!isTestRunning || canUpdateDuringTest);

        // Slow down polling significantly during tests if forced to reduce impact
        const pollInterval = (isTestRunning && forceEnable) ? 5000 : 2000;

        if (shouldUpdate) {
            if (fetchStatsRef.current) fetchStatsRef.current();
            interval = setInterval(() => {
                if (fetchStatsRef.current) fetchStatsRef.current();
            }, pollInterval);
        } else if (isTestRunning && !canUpdateDuringTest && stats) {
            // Clear stats and error if we are paused to show the correct UI
            setStats(null);
            setError(null);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [selectedDevice, autoRefresh, selectedPackage, isActive, isRecording, isTestRunning, allowActionsDuringTest, forceEnable]);


    const recordedLinesRef = useRef<string[]>([]);

    // Recording Logic - Accumulate Data
    useEffect(() => {
        if (isRecording && stats) {
            let line = `${new Date().toISOString()},${stats.cpu_usage.toFixed(2)},${stats.ram_used},${stats.battery_level},${stats.temperature.toFixed(1)}`;

            // Add App stats if present
            if (stats.app_stats) {
                line += `,${stats.app_stats.cpu_usage.toFixed(2)},${stats.app_stats.ram_used},${stats.app_stats.fps}`;
            } else {
                line += ""; // Empty placeholders
            }

            // Add Foreground Activity
            line += `,${stats.foreground_activity || "N/A"}`;

            line += "\n";

            recordedLinesRef.current.push(line);
        }
    }, [stats, isRecording]);

    const toggleRecording = async () => {
        if (isRecording) {
            // Stop Recording: Prompt for save and write all accumulated data
            setIsRecording(false);

            const content = recordedLinesRef.current.join("");

            try {
                await saveFile(async (filePath) => {
                    await invoke('save_file', { path: filePath, content: content, append: false });
                }, 'feedback.saved');
            } catch (e) {
                feedback.toast.error("performance.save_error", e);
            }

            // Clear memory
            recordedLinesRef.current = [];
        } else {
            // Start Recording: Initialize memory array
            const header = "Timestamp,System_CPU_%,System_RAM_KB,Battery_%,Battery_Temp_C" +
                (selectedPackage ? ",App_CPU_%,App_RAM_KB,FPS" : "") + ",Foreground_Activity\n";

            recordedLinesRef.current = [header];
            setIsRecording(true);

            // Optional: Provide visual feedback that recording started (without file dialog)
            feedback.toast.info("performance.recording_started");
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
        setLastSaved: clearFeedback,
        fetchStats,
        isLoading,
        forceEnable,
        setForceEnable
    };
}
