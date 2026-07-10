import { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { open } from "@tauri-apps/plugin-dialog";
import { Play, Square, Eraser, AlignLeft, Package as PackageIcon, FolderSearch, Settings, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";
import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";
import { Modal } from "@/components/organisms/Modal";
import { AiButton } from '@/components/atoms/AiButton';
import { AiResponse } from "@/components/molecules/AiResponse";
import { SplitButton } from "@/components/molecules/SplitButton";
import * as gemini from "@/lib/dashboard/gemini";
import * as claude from "@/lib/dashboard/claude";
import * as openai from "@/lib/dashboard/openai";
import * as claudeCli from "@/lib/dashboard/claudeCode";

interface LogcatSubTabProps {
    selectedDevice: string;
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;
    onNavigate?: (page: string) => void;
}

interface LogEntry {
    id: number;
    text: string;
}

export function LogcatSubTab({ selectedDevice, isTestRunning = false, allowActionsDuringTest = false, onNavigate }: LogcatSubTabProps) {
    const { t, i18n } = useTranslation();
    const [isStreaming, setIsStreaming] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const nextLogId = useRef(1);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const { settings, updateSetting } = useSettings();
    const [currentDumpFile, setCurrentDumpFile] = useState<string | null>(null);
    const [clearBeforeStart, setClearBeforeStart] = useState(false);

    const handleClearLogs = () => {
        setLogs([]);
        nextLogId.current = 1;
    };

    const handleConfigurePath = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            defaultPath: settings.paths.automationRoot || undefined
        });

        if (selected && typeof selected === 'string') {
            await updateSetting('paths', {
                ...settings.paths,
                logcat: selected
            });
            feedback.toast.success(t('settings_page.path_auto_updated', { path: selected }));
        }
    };

    // AI State
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState<{ summary: string, analysis: string } | null>(null);
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

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
        handleClearLogs(); // Explicitly clear logs when device changes (or mounts)
        if (selectedDevice) {
            // Restore state
            invoke<{ is_active: boolean, output_file: string | null }>('get_logcat_details', { device: selectedDevice, sessionId: "logcat_tab" })
                .then((details) => {
                    if (details.is_active) setIsStreaming(true);
                    if (details.output_file) setCurrentDumpFile(details.output_file);
                })
                .catch(console.error);
        }
    }, [selectedDevice]);

    // Setup event listening
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        let isSubscribed = true;

        const shouldStream = isStreaming && selectedDevice && (!isTestRunning || allowActionsDuringTest);

        if (shouldStream) { // Pause streaming during active tests unless allowed
            // Get history first
            invoke<[string[], number]>('fetch_logcat_buffer', {
                device: selectedDevice,
                sessionId: "logcat_tab",
                offset: 0
            }).then((result) => {
                if (!isSubscribed) return;
                const historyLines = result[0];
                if (historyLines && historyLines.length > 0) {
                    setLogs(() => {
                        const updated = historyLines.map(line => ({ id: nextLogId.current++, text: line }));
                        if (updated.length > 5000) return updated.slice(-5000);
                        return updated;
                    });
                }
            }).catch(e => {
                feedback.toast.error("logcat.errors.fetch_failed", e);
            });

            // Listen for new chunks
            listen<{ device: string, session_id: string, lines: string[] }>('logcat-data', (event) => {
                if (event.payload.device === selectedDevice && event.payload.session_id === "logcat_tab") {
                    setLogs(prev => {
                        const newEntries = event.payload.lines.map(line => ({ id: nextLogId.current++, text: line }));
                        const updated = [...prev, ...newEntries];
                        if (updated.length > 5000) return updated.slice(-5000);
                        return updated;
                    });
                }
            }).then(un => {
                if (isSubscribed) {
                    unlisten = un;
                } else {
                    un();
                }
            });
        }

        return () => {
            isSubscribed = false;
            if (unlisten) unlisten();
        };
    }, [isStreaming, selectedDevice, isTestRunning, allowActionsDuringTest]);

    const [selectedPackage, setSelectedPackage] = useState(() => {
        if (settings.logcatSelectedPackage !== undefined) return settings.logcatSelectedPackage;
        const pkgs = settings.tools.appPackage ? settings.tools.appPackage.split(',').map(p => p.trim()).filter(p => p.length > 0) : [];
        return pkgs.length > 0 ? pkgs[0] : "";
    });
    const [logLevel, setLogLevel] = useState(settings.logcatLevel || "E");
    const [extraTags, setExtraTags] = useState(settings.logcatExtraTags || "");
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const filteredLogs = useMemo(() => {
        if (!deferredSearchQuery) return logs;
        const lowerQuery = deferredSearchQuery.toLowerCase();
        return logs.filter(log => log.text.toLowerCase().includes(lowerQuery));
    }, [logs, deferredSearchQuery]);

    const startLogcat = async () => {
        let activeLogcatPath = settings.paths.logcat;

        if (!activeLogcatPath) {
            // Prompt for path if not configured
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: settings.paths.automationRoot || undefined
            });

            if (selected && typeof selected === 'string') {
                await updateSetting('paths', {
                    ...settings.paths,
                    logcat: selected
                });
                feedback.toast.success(t('settings_page.path_auto_updated', { path: selected }));
                activeLogcatPath = selected;
            } else {
                return; // Cancel if no path selected
            }
        }

        const logcatPath = activeLogcatPath;
        let dumpFile = null;
        if (logcatPath) {
            // Sanitize device ID for filename
            const sanDevice = selectedDevice.replace(/[^a-z0-9]/gi, '_');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            dumpFile = `${logcatPath}/logcat_${sanDevice}_${timestamp}.txt`;
        }
        setCurrentDumpFile(dumpFile);

        const activeFilter = selectedPackage || null;


        try {
            handleClearLogs(); // Clear previous logs for clarity

            // Increase buffer size to prevent circular buffer overflow during heavy test processing
            try {
                await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'logcat', '-G', '10M'] });
            } catch (e) {
                console.warn("Failed to increase logcat buffer:", e);
            }

            if (clearBeforeStart) {
                try {
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'logcat', '-c'] });
                } catch (e) {
                    console.warn("Failed to clear logcat:", e);
                }
            }

            await invoke('start_logcat', {
                device: selectedDevice,
                sessionId: "logcat_tab",
                filter: activeFilter,
                level: logLevel,
                outputFile: dumpFile,
                extraTags: extraTags || null
            });
            setIsStreaming(true);
            if (dumpFile) {
                // console.log("Saving logs to:", dumpFile);
                setLogs(prev => [...prev, { id: nextLogId.current++, text: `--- ${t('logcat.saving')} ${dumpFile} ---` }]);
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

        try {
            await invoke('stop_logcat', { device: selectedDevice, sessionId: "logcat_tab" });
            if (!isMounted.current) return; // Prevent state update if unmounted
            setIsStreaming(false);
            if (currentDumpFile) {
                setLogs(prev => [...prev, { id: nextLogId.current++, text: `${t('feedback.saved_to_prefix')} ${currentDumpFile}` }]);
                feedback.toast.success('feedback.logcat_saved');
                setLastSavedFile(currentDumpFile);
                setCurrentDumpFile(null);
            }
        } catch (e) {
            feedback.toast.error("logcat.errors.stop_failed", e);
        }
    };

    const handleAiAnalyze = async (_e: any, customPrompt?: string) => {
        if (logs.length === 0 || isAiLoading) return;

        const currentLang = i18n.language || 'en';
        setIsAiLoading(true);
        setIsAiModalOpen(true);
        setAiError(null);
        setAiResult(null);

const lastLogs = filteredLogs.slice(-100).map(l => l.text).join('\n'); // Take last 100 lines for context

        let promptStr = `Analyze the following Android Logcat output. Identify potential errors, crashes, or performance bottlenecks. Provide a summary and then a detailed analysis. Respond in ${currentLang}.`;
        if (customPrompt) {
            promptStr = `You have a specific instruction from the user:\n"${customPrompt}"\n\nAnalyze the following Android Logcat output based on the user instruction. Respond in ${currentLang}.`;
        }

        const prompt = `${promptStr}\n\nLOGS:\n${lastLogs}`;
        const systemInstruction = `You are an expert Android Developer and QA Engineer. Analyze logcat snippets precisely. Always provide your response in ${currentLang}. Use the exact prefix "Summary: " followed by an EXTREMELY CONCISE one-line summary (MAXIMUM 15 WORDS).`;

        try {
            let result = "";
            const provider = settings.aiProvider;

            if (provider === 'gemini') {
                result = await gemini.askGemini(prompt, settings.geminiApiKey || '', settings.geminiModel, systemInstruction);
            } else if (provider === 'claude') {
                result = await claude.askClaude(prompt, settings.claudeApiKey || '', settings.claudeModel, systemInstruction);
            } else if (provider === 'openai') {
                result = await openai.askOpenAI(prompt, settings.openaiApiKey || '', settings.openaiModel, systemInstruction);
            } else if (provider === 'claude-code') {
                const response = await claudeCli.askClaudeCode(prompt, settings.paths.automationRoot || '', systemInstruction, settings.claudeCodeToken);
                result = typeof response === 'string' ? response : response.result;
            } else if (provider === 'antigravity-cli') {
                const { askAntigravityCli } = await import('@/lib/dashboard/antigravityCode');
                const response = await askAntigravityCli(prompt, settings.paths.automationRoot || '', systemInstruction, settings.antigravityApiKey);
                result = typeof response === 'string' ? response : response.result;
            } else {
                throw new Error("No AI provider configured");
            }

            // Simple parsing (expecting Summary and Analysis sections)
            const summaryMatch = result.match(/Summary:\s*([^\n]*)/i);
            const analysis = result.replace(/Summary:\s*[^\n]*/i, '').trim();

            setAiResult({
                summary: summaryMatch ? summaryMatch[1].trim() : "Log Analysis",
                analysis: analysis || result
            });
        } catch (e: any) {
            setAiError(e.message || String(e));
        } finally {
            setIsAiLoading(false);
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
        <div ref={containerRef} className="h-full flex-1 min-h-0 flex flex-col p-2">
            {/* Toolbar */}
            <Section
                title={t('logcat.title', 'Logcat')}
                icon={AlignLeft}
                variant="transparent"
                className="pb-2 mb-2 p-2"
                status={
                    !settings.paths.logcat && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-warning/10 text-warning rounded-2xl text-[11px] font-medium border border-warning/20">
                            <FolderSearch size={14} />
                            <span>{t('logcat.not_saving')}</span>
                            <Button
                                onClick={handleConfigurePath}
                                className="underline hover:text-warning/80 ml-1"
                            >
                                {t('logcat.configure_path')}
                            </Button>
                            {onNavigate && (
                                <Button
                                    onClick={() => onNavigate?.('settings')}
                                    className="flex items-center gap-1 hover:text-warning/80 ml-2 border-l border-warning/20 pl-2"
                                >
                                    <Settings size={12} />
                                    {t('common.go_to_settings')}
                                </Button>
                            )}
                        </div>
                    )}

                actions={
                    <div className="flex gap-2 items-center">
                        <div className="w-48 relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                            <input 
                                type="text"
                                placeholder={t('logcat.search_placeholder', 'Search logs...')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-8 bg-surface border border-outline-variant/30 rounded-lg pl-8 pr-3 py-1 text-[13px] font-normal normal-case text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
                            />
                        </div>
                        <SplitButton
                            disabled={isTestRunning && !allowActionsDuringTest}
                            variant={isStreaming ? "danger" : "primary"}
                            primaryAction={{
                                label: !isNarrow ? t(isStreaming ? 'logcat.stop' : 'logcat.start') : "",
                                onClick: isStreaming ? stopLogcat : startLogcat,
                                icon: isStreaming ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />
                            }}
                            secondaryActions={[
                                {
                                    label: t('logcat.options.clear_before_start', 'Clear logs before starting (-c)'),
                                    type: 'checkbox',
                                    checked: clearBeforeStart,
                                    onClick: () => setClearBeforeStart(prev => !prev)
                                }
                            ]}
                        />
                        <AiButton
                            id="logcat_analysis"
                            isLoading={isAiLoading}
                            onClick={handleAiAnalyze}
                            label={t('logcat.ai_analyze_button', 'Analyze with AI')}
                            variant="secondary"
                            size="sm"
                            disabled={filteredLogs.length === 0 || isAiLoading}
                            className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10"
                            allowCustomPrompt={true}
                        />
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
                {filteredLogs.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/80 font-sans text-sm">
                        <AlignLeft size={32} className="opacity-20 mb-2" />
                        <p>
                            {isTestRunning ? t('logcat.status.paused_test', "Logcat paused during test") :
                                searchQuery ? t('logcat.status.no_results', "No logs match the search query") :
                                isStreaming ? t('logcat.status.waiting') : t('logcat.status.empty')}
                        </p>
                    </div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        data={filteredLogs}
                        className="custom-scrollbar"
                        followOutput="auto"
                        atBottomThreshold={50} // If user scrolls up, stop auto-scrolling
                        itemContent={(_, log) => (
                            <div className="on-primaryspace-pre-wrap hover:bg-surface-variant/30 px-2 py-0.5 break-all transition-colors flex gap-2">
                                <div className="select-none text-on-surface-variant/40 text-[10px] min-w-[36px] text-right pt-[1px] font-mono shrink-0">
                                    {log.id}
                                </div>
                                <div className="flex-1">
                                    {log.text.startsWith(t('feedback.saved_to_prefix')) ? (
                                        <span
                                            className="text-primary dark:text-primary/80 underline cursor-pointer hover:opacity-80"
                                            onClick={() => invoke('open_path', { path: log.text.replace(t('feedback.saved_to_prefix') + ' ', '') })}
                                            data-tooltip={t('logcat.open_file', 'Click to open file')}
                                            data-position="top"
                                        >
                                            {log.text}
                                        </span>
                                    ) : (
                                        log.text
                                    )}
                                </div>
                            </div>
                        )}
                        style={{ height: '100%' }}
                    />
                )}
            </div>

            {/* AI Analysis Modal */}
            <Modal
                isOpen={isAiModalOpen}
                onClose={() => setIsAiModalOpen(false)}
                title={t('logcat.ai_analysis_title', 'AI Analysis Result')}
                className="max-w-2xl"
            >
                <div className="space-y-4">
                    <AiResponse
                        title={aiResult?.summary || t('logcat.analyzing')}
                        isLoading={isAiLoading}
                        response={aiResult?.analysis}
                        error={aiError}
                        onCopy={() => {
                            if (aiResult) {
                                navigator.clipboard.writeText(`${aiResult.summary}\n\n${aiResult.analysis}`);
                                feedback.toast.success('common.copied');
                            }
                        }}
                    />
                </div>
            </Modal>
            <div className="flex items-center justify-between w-full mt-2">
                <div className="flex items-center gap-2">
                    {/* Package Selector */}
                    <div className="w-40">
                        <Select
                            options={[
                                { label: t('logcat.entire_system'), value: "" },
                                ...(settings.tools?.appPackage ? settings.tools.appPackage.split(',') : []).map(p => ({ label: p.trim(), value: p.trim() })).filter(o => o.value)
                            ]}
                            value={selectedPackage}
                            onChange={(e) => {
                                setSelectedPackage(e.target.value);
                                updateSetting('logcatSelectedPackage', e.target.value);
                            }}
                            leftIcon={<PackageIcon size={14} />}
                            disabled={isStreaming}
                            containerClassName="w-full"
                            dropdownPosition="top"
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
                            onChange={(e) => {
                                setLogLevel(e.target.value);
                                updateSetting('logcatLevel', e.target.value);
                            }}
                            dropdownPosition="top"
                        />
                    </div>
                    <div className="w-48">
                        <input 
                            type="text"
                            value={extraTags}
                            onChange={e => setExtraTags(e.target.value)}
                            onBlur={() => updateSetting('logcatExtraTags', extraTags)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    updateSetting('logcatExtraTags', extraTags);
                                }
                            }}
                            placeholder={t('logcat.custom_tags_placeholder', 'Tags (e.g. App:V)')}
                            className="w-full h-8 bg-surface border border-outline-variant/30 rounded-lg px-3 py-1 text-[13px] text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
                            disabled={isStreaming}
                        />
                    </div>
                </div>
                <div className="text-xs text-on-surface/80 flex items-center justify-end">
                    {searchQuery ? `${filteredLogs.length} / ${logs.length}` : logs.length} {t('logcat.lines')}
                    <Button
                        onClick={() => { handleClearLogs(); setSearchQuery(""); }}
                        variant="ghost"
                        size="sm"
                        className="px-3 py-1.5 ml-2 rounded-2xl text-xs font-medium items-center justify-center gap-2 bg-surface text-on-surface/80 border border-outline-variant/30 hover:bg-surface-variant/50 transition-colors h-auto"
                        data-tooltip={t('logcat.clear')}
                        data-position="left"
                    >
                        <Eraser size={14} />
                    </Button>
                </div>
            </div>
        </div >
    );
}
