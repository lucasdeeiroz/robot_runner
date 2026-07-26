import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";

export interface StopwatchLap {
    keyword: string;
    timestamp: number;
    deltaMs: number;
}

interface StopwatchCacheEntry {
    laps: StopwatchLap[];
    isStopwatchRunning: boolean;
    startTime: number | null;
}
const stopwatchCacheMap = new Map<string, StopwatchCacheEntry>();

function matchesWildcardKeyword(line: string, keyword: string): boolean {
    if (!line || !keyword) return false;
    const trimmedKw = keyword.trim();
    if (!trimmedKw) return false;

    if (trimmedKw.includes('*')) {
        const regexStr = trimmedKw
            .split('*')
            .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
        try {
            const regex = new RegExp(regexStr, 'i');
            return regex.test(line);
        } catch (e) {
            return line.toLowerCase().includes(trimmedKw.toLowerCase());
        }
    }
    return line.toLowerCase().includes(trimmedKw.toLowerCase());
}

export function useLogcatStopwatch(selectedDevice: string, selectedPackage: string) {
    const { settings } = useSettings();
    const cached = selectedDevice ? stopwatchCacheMap.get(selectedDevice) : undefined;

    // Stopwatch State
    const keywords = settings.logcatKeywords || [];
    const [laps, setLaps] = useState<StopwatchLap[]>(() => cached?.laps ?? []);
    const [deltaUnit, setDeltaUnit] = useState<'ms' | 's' | 'min' | 'h'>('ms');
    const [isStopwatchRunning, setIsStopwatchRunning] = useState(() => cached?.isStopwatchRunning ?? false);
    const [newKeyword, setNewKeyword] = useState("");
    const [startTime, setStartTime] = useState<number | null>(() => cached?.startTime ?? null);

    // Sync cache on state change
    useEffect(() => {
        if (selectedDevice) {
            stopwatchCacheMap.set(selectedDevice, {
                laps,
                isStopwatchRunning,
                startTime
            });
        }
    }, [selectedDevice, laps, isStopwatchRunning, startTime]);

    // Check backend status on mount
    useEffect(() => {
        if (selectedDevice) {
            invoke<boolean>('is_logcat_active', { device: selectedDevice, sessionId: "stopwatch_tab" })
                .then((active) => {
                    if (active) setIsStopwatchRunning(true);
                })
                .catch(console.error);
        }
    }, [selectedDevice]);

    const handleRemoveLap = (index: number) => {
        setLaps(prev => {
            const newLaps = prev.filter((_, i) => i !== index);
            return newLaps.map((lap, i) => {
                const prevLap = newLaps[i - 1] as any;
                const currentLap = lap as any;
                const usePerf = currentLap._perfTime && prevLap && prevLap._perfTime;

                const deltaMsRaw = i > 0
                    ? (usePerf ? currentLap._perfTime - prevLap._perfTime : lap.timestamp - newLaps[i - 1].timestamp)
                    : 0;

                return { ...lap, deltaMs: Number(Math.max(0, deltaMsRaw).toFixed(3)) };
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
                setStartTime(Date.now());
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
                                if (matchesWildcardKeyword(line, kw)) {
                                    setLaps(prev => {
                                        const now = performance.now();
                                        const timestamp = Date.now(); // Keep Date.now for UI display of time
                                        const deltaMs = prev.length > 0 ? Math.max(0, now - (prev[prev.length - 1] as any)._perfTime) : 0;
                                        return [...prev, { keyword: kw, timestamp, deltaMs, _perfTime: now } as any];
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
        setNewKeyword,
        startTime
    };
}
