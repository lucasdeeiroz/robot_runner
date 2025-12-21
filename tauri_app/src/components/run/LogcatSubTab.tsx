import { useState, useEffect, useRef } from "react";
import { Play, Square, Eraser, AlignLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "@/lib/settings";
import clsx from "clsx";

interface LogcatSubTabProps {
    selectedDevice: string;
}

interface LogcatLine {
    device: string;
    line: string;
}

export function LogcatSubTab({ selectedDevice }: LogcatSubTabProps) {
    const { t } = useTranslation();
    const [isStreaming, setIsStreaming] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);
    const { settings } = useSettings();

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
        if (selectedDevice) {
            invoke('is_logcat_active', { device: selectedDevice })
                .then((isActive) => {
                    if (isActive) setIsStreaming(true);
                })
                .catch(console.error);
        }
    }, [selectedDevice]);

    // Setup polling (no more listeners)
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isStreaming && selectedDevice) {
            console.log("Starting polling for", selectedDevice);
            interval = setInterval(async () => {
                try {
                    const newLines = await invoke<string[]>('fetch_logcat_buffer', { device: selectedDevice });
                    if (newLines && newLines.length > 0) {
                        setLogs(prev => {
                            const updated = [...prev, ...newLines];
                            if (updated.length > 5000) return updated.slice(-5000);
                            return updated;
                        });
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

    // Auto-scroll
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [logs]);

    const [filterApp, setFilterApp] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState("");
    const [logLevel, setLogLevel] = useState("V");

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

        const activeFilter = filterApp && selectedPackage ? selectedPackage : null;
        console.log("Filter App:", filterApp, "Package:", activeFilter, "Level:", logLevel);

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
            alert(`Failed to start logcat: ${e}`);
        }
    };

    const stopLogcat = async () => {
        console.log("Stopping logcat for", selectedDevice);
        try {
            await invoke('stop_logcat', { device: selectedDevice });
            setIsStreaming(false);
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
        <div className="h-full flex flex-col space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                    onClick={isStreaming ? stopLogcat : startLogcat}
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                        isStreaming
                            ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                            : "bg-green-600 text-white hover:bg-green-500 shadow-sm"
                    )}
                >
                    {isStreaming ? (
                        <>
                            <Square size={14} fill="currentColor" /> {t('logcat.stop')}
                        </>
                    ) : (
                        <>
                            <Play size={14} fill="currentColor" /> {t('logcat.start')}
                        </>
                    )}
                </button>

                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-2" />

                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={filterApp}
                        onChange={(e) => setFilterApp(e.target.checked)}
                        className="rounded bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-purple-600 focus:ring-purple-500"
                    />
                    {t('logcat.filter')}
                </label>

                {filterApp && (
                    packages.length > 0 ? (
                        <select
                            value={selectedPackage}
                            onChange={(e) => setSelectedPackage(e.target.value)}
                            className="text-xs bg-zinc-200 dark:bg-zinc-700 border-none rounded px-2 py-1 text-zinc-700 dark:text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none"
                        >
                            {packages.map((pkg, i) => (
                                <option key={i} value={pkg}>{pkg}</option>
                            ))}
                        </select>
                    ) : (
                        <span className="text-xs text-amber-500 italic px-1">{t('logcat.no_packages')}</span>
                    )
                )}

                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-2" />

                <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                    className="text-xs bg-zinc-200 dark:bg-zinc-700 border-none rounded px-2 py-1 text-zinc-700 dark:text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none"
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

                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-2" />

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

            {/* Log Viewer */}
            <div
                ref={listRef}
                className="flex-1 bg-zinc-900 font-mono text-xs text-zinc-300 p-2 overflow-y-auto rounded-lg border border-zinc-800"
            >
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-700">{t('logcat.no_logs')}</div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap hover:bg-white/5 px-1 rounded break-all">
                            {log}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
