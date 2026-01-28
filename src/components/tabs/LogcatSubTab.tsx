import { useState, useEffect, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Play, Square, Eraser, AlignLeft, Package as PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";
import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";

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
                    feedback.toast.error("logcat.errors.fetch_failed", e);
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
        // console.log("Starting logcat for", selectedDevice);

        let dumpFile = null;
        if (settings.paths.logcat) {
            // Sanitize device ID for filename
            const sanDevice = selectedDevice.replace(/[^a-z0-9]/gi, '_');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            dumpFile = `${settings.paths.logcat}/logcat_${sanDevice}_${timestamp}.txt`;
        }
        setCurrentDumpFile(dumpFile);

        const activeFilter = selectedPackage || null;
        // console.log("Package:", activeFilter, "Level:", logLevel);

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
                // console.log("Saving logs to:", dumpFile);
                setLogs(prev => [...prev, `--- ${t('logcat.saving')} ${dumpFile} ---`]);
            }
        } catch (e) {
            feedback.toast.error("logcat.errors.start_failed", e);
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
        // console.log("Stopping logcat for", selectedDevice);
        try {
            await invoke('stop_logcat', { device: selectedDevice });
            if (!isMounted.current) return; // Prevent state update if unmounted
            setIsStreaming(false);
            if (currentDumpFile) {
                setLogs(prev => [...prev, `${t('feedback.saved_to_prefix')} ${currentDumpFile}`]);
                feedback.toast.success('feedback.logcat_saved');
                setLastSavedFile(currentDumpFile);
                setCurrentDumpFile(null);
            }
        } catch (e) {
            feedback.toast.error("logcat.errors.stop_failed", e);
        }
    };

    if (!selectedDevice) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-on-surface/80">
                <AlignLeft size={48} className="mb-4 opacity-20" />
                <p>{t('logcat.select_device')}</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full flex flex-col p-2 overflow-y-auto">
            {/* Toolbar */}
            <Section
                title={t('logcat.title', 'Logcat')}
                icon={AlignLeft}
                variant="transparent"
                className="pb-2 mb-2 p-2"
                status={
                    <div className="text-xs text-on-surface/80">
                        {logs.length} {t('logcat.lines')}
                        <button
                            onClick={() => { setLogs([]); }}
                            className="px-3 py-1.5 ml-2 rounded-2xl text-xs font-medium items-center justify-center gap-2 bg-surface text-on-surface/80 border border-outline-variant/30 hover:bg-surface-variant/50 transition-colors"
                            title={t('logcat.clear')}
                        >
                            <Eraser size={14} />
                        </button>
                    </div>
                }
                menus={!isNarrow ? (
                    <div className="flex items-center gap-2">
                        {/* Package Selector */}
                        <div className="w-40">
                            <Select
                                options={[
                                    { label: t('logcat.entire_system'), value: "" },
                                    ...(settings.tools?.appPackage ? settings.tools.appPackage.split(',') : []).map(p => ({ label: p.trim(), value: p.trim() })).filter(o => o.value)
                                ]}
                                value={selectedPackage}
                                onChange={(e) => setSelectedPackage(e.target.value)}
                                leftIcon={<PackageIcon size={14} />}
                                disabled={isStreaming}
                                containerClassName="w-full"
                            />
                        </div>
                        <div className="w-28">
                            <Select
                                options={[
                                    { label: "Verbose", value: "V" },
                                    { label: "Debug", value: "D" },
                                    { label: "Info", value: "I" },
                                    { label: "Warning", value: "W" },
                                    { label: "Error", value: "E" },
                                    { label: "Fatal", value: "F" },
                                    { label: "Silent", value: "S" },
                                ]}
                                value={logLevel}
                                onChange={(e) => setLogLevel(e.target.value)}
                            />
                        </div>
                    </div>
                ) : null
                }
                actions={
                    <div className="flex gap-2">
                        <Button
                            onClick={isStreaming ? stopLogcat : startLogcat}
                            variant={isStreaming ? "danger" : "primary"}
                            size="sm"
                            leftIcon={isStreaming ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        >
                            {!isNarrow && t(isStreaming ? 'logcat.stop' : 'logcat.start')}
                        </Button>
                    </div>
                }
            />

            < FileSavedFeedback
                path={lastSavedFile}
                onClose={() => setLastSavedFile(null)}
            />

            {/* Log Viewer */}
            {/* Log Area */}
            <div className="flex-1 min-h-0 bg-surface text-on-surface/80 font-mono text-xs relative border border-outline-variant/30 rounded-2xl">
                {logs.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/80 gap-2 pointer-events-none">
                        <AlignLeft size={32} className="opacity-20" />
                        <span className="opacity-50">{isStreaming ? t('logcat.status.waiting') : t('logcat.status.empty')}</span>
                    </div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        data={logs}
                        className="custom-scrollbar"
                        followOutput="auto"
                        atBottomThreshold={50} // If user scrolls up, stop auto-scrolling
                        itemContent={(_, log) => (
                            <div className="on-primaryspace-pre-wrap hover:bg-surface-variant/30 px-2 py-0.5 break-all transition-colors">
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
        </div >
    );
}
