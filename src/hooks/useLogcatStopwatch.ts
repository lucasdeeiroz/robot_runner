import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";

export interface StopwatchLap {
    keyword: string;
    timestamp: number;
    deltaMs: number;
}

export interface HardwareFrameDelta {
    tti_ms: number;
    last_touch_timestamp: number;
    last_redraw_timestamp: number;
    package_name: string;
    source: string;
}

export interface SavedRound {
    id: string;
    totalTimeMs: number;
    laps: StopwatchLap[];
}

interface StopwatchCacheEntry {
    laps: StopwatchLap[];
    savedRounds: SavedRound[];
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
    const [savedRounds, setSavedRounds] = useState<SavedRound[]>(() => cached?.savedRounds ?? []);
    const [deltaUnit, setDeltaUnit] = useState<'ms' | 's' | 'min' | 'h'>('ms');
    const [isStopwatchRunning, setIsStopwatchRunning] = useState(() => cached?.isStopwatchRunning ?? false);
    const [newKeyword, setNewKeyword] = useState("");
    const [startTime, setStartTime] = useState<number | null>(() => cached?.startTime ?? null);
    const [hardwareFrameDelta, setHardwareFrameDelta] = useState<HardwareFrameDelta | null>(null);

    // Companion Sync State
    const [companionLaps, setCompanionLaps] = useState<StopwatchLap[]>([]);
    const [companionSavedRounds, setCompanionSavedRounds] = useState<SavedRound[]>([]);
    const [isCompanionActive, setIsCompanionActive] = useState(false);

    useEffect(() => {
        if (isStopwatchRunning && selectedDevice) {
            const interval = setInterval(() => {
                invoke<HardwareFrameDelta>('get_companion_frame_delta', { device: selectedDevice })
                    .then((data) => {
                        if (data && data.source === 'companion_hardware') {
                            setHardwareFrameDelta(data);
                        }
                    })
                    .catch(console.error);
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [isStopwatchRunning, selectedDevice]);

    // Sync cache on state change
    useEffect(() => {
        if (selectedDevice) {
            stopwatchCacheMap.set(selectedDevice, {
                laps,
                savedRounds,
                isStopwatchRunning,
                startTime
            });
        }
    }, [selectedDevice, laps, savedRounds, isStopwatchRunning, startTime]);

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

    // Sync keywords to Companion App
    useEffect(() => {
        if (selectedDevice) {
            invoke('trigger_companion_action', {
                port: 9876,
                endpoint: '/stopwatch/keywords',
                method: 'POST',
                payload: JSON.stringify({ keywords })
            }).catch(() => {
                // Ignore errors if companion is not running
            });
        }
    }, [keywords, selectedDevice]);

    // Poll Companion Logcat Laps
    useEffect(() => {
        if (!selectedDevice) return;
        const interval = setInterval(() => {
            invoke<string>('trigger_companion_action', {
                port: 9876,
                endpoint: '/stopwatch/logcat/laps',
                method: 'GET'
            })
                .then(rawJson => JSON.parse(rawJson))
                .then(data => {
                    if (data.status === 'ok') {
                        setIsCompanionActive(true);
                        setCompanionLaps(data.laps || []);
                        setCompanionSavedRounds(data.savedRounds || []);
                    } else {
                        setIsCompanionActive(false);
                    }
                })
                .catch(() => {
                    setIsCompanionActive(false);
                });
        }, 2000);
        return () => clearInterval(interval);
    }, [selectedDevice]);

    const handleCompanionAction = async (action: string, payload: any = {}) => {
        try {
            await invoke('trigger_companion_action', {
                port: 9876,
                endpoint: '/stopwatch/logcat/action',
                method: 'POST',
                payload: JSON.stringify({ action, ...payload })
            });
        } catch (e) {
            console.error('Failed to send companion action', e);
        }
    };

    const handleRemoveLap = (index: number) => {
        if (isCompanionActive) {
            handleCompanionAction('removeLap', { index });
            return;
        }
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

    const handleSaveRound = () => {
        if (isCompanionActive) {
            handleCompanionAction('saveRound');
            return;
        }
        if (laps.length === 0) return;
        const totalTimeMs = laps.reduce((sum, lap) => sum + lap.deltaMs, 0);
        const newRound: SavedRound = {
            id: `round_${Date.now()}`,
            totalTimeMs,
            laps: [...laps]
        };
        setSavedRounds(prev => [...prev, newRound]);
        setLaps([]);
        feedback.toast.success('Stopwatch results saved!');
    };

    const handleClearLaps = () => {
        if (isCompanionActive) {
            handleCompanionAction('clearLaps');
            return;
        }
        setLaps([]);
    };

    const handleClearAllRounds = () => {
        if (isCompanionActive) {
            handleCompanionAction('clearAllSavedRounds');
            return;
        }
        setSavedRounds([]);
    };

    const handleRemoveSavedRound = (id: string) => {
        if (isCompanionActive) {
            handleCompanionAction('removeSavedRound', { id });
            return;
        }
        setSavedRounds(prev => prev.filter(r => r.id !== id));
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
        laps: isCompanionActive ? companionLaps : laps,
        savedRounds: isCompanionActive ? companionSavedRounds : savedRounds,
        isCompanionActive,
        setLaps: handleClearLaps, // legacy
        handleClearLaps,
        handleSaveRound,
        handleRemoveSavedRound,
        handleClearAllRounds,
        deltaUnit,
        setDeltaUnit,
        isStopwatchRunning,
        handleRemoveLap,
        handleToggleStopwatch,
        keywords,
        newKeyword,
        setNewKeyword,
        startTime,
        hardwareFrameDelta
    };
}
