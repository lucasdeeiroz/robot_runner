import { useState, useEffect, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Play, Square, Eraser, AlignLeft, Package as PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import { useSettings } from "@/lib/settings";
import clsx from "clsx";
import { feedback } from "@/lib/feedback";
import { FileSavedFeedback } from "@/components/common/FileSavedFeedback";

interface LogcatSubTabProps {
    selectedDevice: string;
}



export function LogcatSubTab({ selectedDevice }: LogcatSubTabProps) {
    const { t } = useTranslation();
    const [isStreaming, setIsStreaming] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const { settings } = useSettings();
    const [currentDumpFile, setCurrentDumpFile] = useState<string | null>(null);

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 500); // Threshold for Logcat toolbar
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Auto-stop when unmounting or changing device?
    useEffect(() => {
        return () => {
            if (isStreaming && selectedDevice) {
                stopLogcat();
            }
        };
    }, [selectedDevice]);

    // Check status on mount
    useEffect(() => {
        setLogs([]); // Explicitly clear logs when device changes (or mounts)
        if (selectedDevice) {
            // Restore state
            invoke<{ is_active: boolean, output_file: string | null }>('get_logcat_details', { device: selectedDevice })
                .then((details) => {
                    if (details.is_active) setIsStreaming(true);
                    if (details.output_file) setCurrentDumpFile(details.output_file);
                })
                .catch(console.error);
        }
    }, [selectedDevice]);

    // Setup polling with offset
    useEffect(() => {
        let interval: NodeJS.Timeout;
        let pollingOffset = 0; // Local offset for this session

        if (isStreaming && selectedDevice) {

            interval = setInterval(async () => {
                try {
                    const result = await invoke<[string[], number]>('fetch_logcat_buffer', {
                        device: selectedDevice,
                        offset: pollingOffset
                    });
                    const newLines = result[0];
                    const totalLen = result[1];

                    if (totalLen < pollingOffset) {
                        // Buffer reset on device?
                        pollingOffset = 0;
                    } else {
                        if (newLines && newLines.length > 0) {
                            setLogs(prev => {
                                const updated = [...prev, ...newLines];
                                if (updated.length > 5000) return updated.slice(-5000);
                                return updated;
                            });
                        }
                        // Only update offset if it actually grew
                        if (totalLen > pollingOffset) {
                            pollingOffset = totalLen;
                        }
                    }
                } catch (e) {
                    console.error("Polling error:", e);
                }
            }, 200); // 200ms
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isStreaming, selectedDevice]);

    const [selectedPackage, setSelectedPackage] = useState("");
    const [logLevel, setLogLevel] = useState("E");

    // Parse packages from settings
    const packages = settings.tools.appPackage
        ? settings.tools.appPackage
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0)
        : [];

    // Auto-select first package if available
    useEffect(() => {
        if (packages.length > 0 && !selectedPackage) {
            setSelectedPackage(packages[0]);
        }
    }, [settings.tools.appPackage]);

    const startLogcat = async () => {
        console.log("Starting logcat for", selectedDevice);

        let dumpFile = null;
        if (settings.paths.logcat) {
            // Sanitize device ID for filename
            const sanDevice = selectedDevice.replace(/[^a-z0-9]/gi, '_');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            dumpFile = `${settings.paths.logcat}/logcat_${sanDevice}_${timestamp}.txt`;
        }
        setCurrentDumpFile(dumpFile);

        const activeFilter = selectedPackage || null;
        console.log("Package:", activeFilter, "Level:", logLevel);

        try {
            setLogs([]); // Clear previous logs for clarity
            await invoke('start_logcat', {
                device: selectedDevice,
                filter: activeFilter,
                level: logLevel,
                outputFile: dumpFile
            });
            setIsStreaming(true);
            if (dumpFile) {
                console.log("Saving logs to:", dumpFile);
                setLogs(prev => [...prev, `--- ${t('logcat.saving')} ${dumpFile} ---`]);
            }
        } catch (e) {
            console.error("Failed to start logcat", e);
            const errStr = String(e);
            if (errStr.startsWith("APP_NOT_RUNNING:")) {
                const pkg = errStr.split(":")[1];
                feedback.toast.error(t('logcat.errors.app_not_running', { pkg }));
            } else {
                feedback.toast.error(`${t('common.error_occurred', { error: errStr })}`);
            }
        }
    };

    // Track mount status
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const [lastSavedFile, setLastSavedFile] = useState<string | null>(null);

    const stopLogcat = async () => {
        console.log("Stopping logcat for", selectedDevice);
        try {
            await invoke('stop_logcat', { device: selectedDevice });
            if (!isMounted.current) return; // Prevent state update if unmounted
            setIsStreaming(false);
            if (currentDumpFile) {
                // Keep the log in the text list as well? user might want it.
                setLogs(prev => [...prev, `${t('feedback.saved_to_prefix')} ${currentDumpFile}`]);
                feedback.toast.success('feedback.logcat_saved');
                setLastSavedFile(currentDumpFile);
                setCurrentDumpFile(null);
            }
        } catch (e) {
            console.error("Failed to stop logcat", e);
        }
    };

    if (!selectedDevice) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                <AlignLeft size={48} className="mb-4 opacity-20" />
                <p>{t('logcat.select_device')}</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full flex flex-col space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                    onClick={isStreaming ? stopLogcat : startLogcat}
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                        isStreaming
                            ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                            : "bg-primary text-white hover:opacity-90 shadow-sm"
                    )}
                >
                    {isStreaming ? (
                        <>
                            <Square size={14} fill="currentColor" /> {!isNarrow && t('logcat.stop')}
                        </>
                    ) : (
                        <>
                            <Play size={14} fill="currentColor" /> {!isNarrow && t('logcat.start')}
                        </>
                    )}
                </button>

                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

                {/* Package Selector */}
                <div className="relative">
                    <select
                        value={selectedPackage}
                        onChange={(e) => setSelectedPackage(e.target.value)}
                        className={clsx(
                            "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-md py-1.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all",
                            isNarrow ? "px-2" : "pl-8 pr-2",
                            "truncate",
                            isNarrow ? "w-48" : "w-40", // Fixed width for visibility
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        disabled={isStreaming}
                    >
                        <option value="">{t('logcat.entire_system')}</option>
                        {(settings.tools?.appPackage ? settings.tools.appPackage.split(',') : []).map((pkg) => {
                            const p = pkg.trim();
                            return p ? <option key={p} value={p}>{p}</option> : null;
                        })}
                    </select>
                    <PackageIcon
                        size={14}
                        className={clsx(
                            "absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none",
                            isNarrow ? "hidden" : "block"
                        )}
                    />
                </div>

                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

                <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                    className="text-xs bg-zinc-200 dark:bg-zinc-700 border-none rounded px-2 py-1 text-zinc-700 dark:text-zinc-200 focus:ring-1 focus:ring-primary outline-none"
                    title={t('logcat.level')}
                >
                    <option value="V">Verbose</option>
                    <option value="D">Debug</option>
                    <option value="I">Info</option>
                    <option value="W">Warning</option>
                    <option value="E">Error</option>
                    <option value="F">Fatal</option>
                    <option value="S">Silent</option>
                </select>

                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

                <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-zinc-600 dark:text-zinc-400"
                    title={t('logcat.clear')}
                    onClick={() => setLogs([])}
                >
                    <Eraser size={16} />
                </button>

                <div className="flex-1" />

                <div className="text-xs text-zinc-400">
                    {logs.length} {t('logcat.lines')}
                </div>
            </div>

            <FileSavedFeedback
                path={lastSavedFile}
                onClose={() => setLastSavedFile(null)}
            />

            {/* Log Viewer */}
            {/* Log Viewer */}
            <div
                className="flex-1 bg-zinc-900 font-mono text-xs text-zinc-300 rounded-lg border border-zinc-800 overflow-hidden"
            >
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-700">{t('logcat.no_logs')}</div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        data={logs}
                        followOutput="auto"
                        atBottomThreshold={50} // If user scrolls up, stop auto-scrolling
                        itemContent={(_, log) => (
                            <div className="whitespace-pre-wrap hover:bg-white/5 px-2 py-0.5 break-all">
                                {log.startsWith(t('feedback.saved_to_prefix')) ? (
                                    <span
                                        className="text-primary underline cursor-pointer hover:opacity-80"
                                        onClick={() => invoke('open_path', { path: log.replace(t('feedback.saved_to_prefix') + ' ', '') })}
                                        title={t('logcat.open_file', 'Click to open file')}
                                    >
                                        {log}
                                    </span>
                                ) : (
                                    log
                                )}
                            </div>
                        )}
                        style={{ height: '100%' }}
                    />
                )}
            </div>
        </div>
    );
}
