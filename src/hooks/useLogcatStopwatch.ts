import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";

export interface StopwatchLap {
    keyword: string;
    timestamp: number;
    deltaMs: number;
}

export function useLogcatStopwatch(selectedDevice: string, selectedPackage: string) {
    const { settings } = useSettings();

    // Stopwatch State
    const keywords = settings.logcatKeywords || [];
    const [laps, setLaps] = useState<StopwatchLap[]>([]);
    const [deltaUnit, setDeltaUnit] = useState<'ms' | 's' | 'min' | 'h'>('ms');
    const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
    const [newKeyword, setNewKeyword] = useState("");

    const handleRemoveLap = (index: number) => {
        setLaps(prev => {
            const newLaps = prev.filter((_, i) => i !== index);
            return newLaps.map((lap, i) => {
                const deltaMs = i > 0 ? lap.timestamp - newLaps[i - 1].timestamp : 0;
                return { ...lap, deltaMs };
            });
        });
    };

    const handleToggleStopwatch = async () => {
        if (isStopwatchRunning) {
            try {
                await invoke('stop_logcat', { device: selectedDevice, sessionId: "stopwatch_tab" });
            } catch (e) {
                console.error(e);
            }
            setIsStopwatchRunning(false);
        } else {
            setLaps([]);
            try {
                await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'logcat', '-G', '10M'] });
                await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'logcat', '-c'] });
                await invoke('start_logcat', {
                    device: selectedDevice,
                    sessionId: "stopwatch_tab",
                    filter: selectedPackage || null,
                    level: settings.logcatLevel || "V",
                    outputFile: null,
                    extraTags: settings.logcatExtraTags || null
                });
                setIsStopwatchRunning(true);
            } catch (e: any) {
                if (typeof e === 'string' && e.includes('already running')) {
                    setIsStopwatchRunning(true);
                } else {
                    console.error(e);
                    feedback.toast.error(String(e));
                }
            }
        }
    };

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let isSubscribed = true;

        if (isStopwatchRunning && keywords.length > 0 && selectedDevice) {
            import('@tauri-apps/api/event').then(({ listen }) => {
                listen<{ device: string, session_id: string, lines: string[] }>('logcat-data', (event) => {
                    if (event.payload.device === selectedDevice && event.payload.session_id === "stopwatch_tab" && isSubscribed) {
                        const lines = event.payload.lines;
                        for (const line of lines) {
                            for (const kw of keywords) {
                                if (line.includes(kw)) {
                                    setLaps(prev => {
                                        const now = Date.now();
                                        const deltaMs = prev.length > 0 ? now - prev[prev.length - 1].timestamp : 0;
                                        return [...prev, { keyword: kw, timestamp: now, deltaMs }];
                                    });
                                }
                            }
                        }
                    }
                }).then(un => {
                    if (isSubscribed) unlisten = un;
                    else un();
                });
            });
        }

        return () => {
            isSubscribed = false;
            if (unlisten) unlisten();
        };
    }, [isStopwatchRunning, keywords, selectedDevice]);

    return {
        laps,
        setLaps,
        deltaUnit,
        setDeltaUnit,
        isStopwatchRunning,
        handleRemoveLap,
        handleToggleStopwatch,
        keywords,
        newKeyword,
        setNewKeyword
    };
}
