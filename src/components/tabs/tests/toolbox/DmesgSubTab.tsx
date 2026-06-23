import { useState, useEffect, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { open } from "@tauri-apps/plugin-dialog";
import { Play, Square, Eraser, AlignLeft, FolderSearch, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { useSettings } from "@/lib/settings";
import { feedback } from "@/lib/feedback";
import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { Modal } from "@/components/organisms/Modal";
import { AiButton } from '@/components/atoms/AiButton';
import { AiResponse } from "@/components/molecules/AiResponse";
import * as gemini from "@/lib/dashboard/gemini";
import * as claude from "@/lib/dashboard/claude";
import * as openai from "@/lib/dashboard/openai";
import * as claudeCli from "@/lib/dashboard/claudeCode";

interface DmesgSubTabProps {
    selectedDevice: string;
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;
    onNavigate?: (page: string) => void;
}

export function DmesgSubTab({ selectedDevice, isTestRunning = false, allowActionsDuringTest = false, onNavigate }: DmesgSubTabProps) {
    const { t, i18n } = useTranslation();
    const [isStreaming, setIsStreaming] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const { settings, updateSetting } = useSettings();
    const [currentDumpFile, setCurrentDumpFile] = useState<string | null>(null);

    const handleConfigurePath = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            defaultPath: settings.paths.automationRoot || undefined
        });

        if (selected && typeof selected === 'string') {
            await updateSetting('paths', {
                ...settings.paths,
                logcat: selected // Reuse logcat path for simplicity or create a new one. We'll reuse logcat.
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
                setIsNarrow(entry.contentRect.width < 500);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (isStreaming && selectedDevice) {
                stopDmesg();
            }
        };
    }, [selectedDevice]);

    // Check status on mount
    useEffect(() => {
        setLogs([]);
        if (selectedDevice) {
            invoke<{ is_active: boolean, output_file: string | null }>('get_dmesg_details', { device: selectedDevice })
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

        if (shouldStream) {
            invoke<[string[], number]>('fetch_dmesg_buffer', {
                device: selectedDevice,
                offset: 0
            }).then((result) => {
                if (!isSubscribed) return;
                const historyLines = result[0];
                if (historyLines && historyLines.length > 0) {
                    setLogs(() => {
                        const updated = [...historyLines];
                        if (updated.length > 5000) return updated.slice(-5000);
                        return updated;
                    });
                }
            }).catch(e => {
                console.error("Dmesg fetch failed", e);
            });

            listen<{ device: string, lines: string[] }>('dmesg-data', (event) => {
                if (event.payload.device === selectedDevice) {
                    setLogs(prev => {
                        const updated = [...prev, ...event.payload.lines];
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


    const startDmesg = async () => {
        let activePath = settings.paths.logcat; // We reuse the logcat path settings to save dmesg files

        if (!activePath) {
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
                activePath = selected;
            } else {
                return;
            }
        }

        const logcatPath = activePath;
        let dumpFile = null;
        if (logcatPath) {
            const sanDevice = selectedDevice.replace(/[^a-z0-9]/gi, '_');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            dumpFile = `${logcatPath}/dmesg_${sanDevice}_${timestamp}.txt`;
        }
        setCurrentDumpFile(dumpFile);

        try {
            setLogs([]);
            await invoke('start_dmesg', {
                device: selectedDevice,
                outputFile: dumpFile
            });
            setIsStreaming(true);
            if (dumpFile) {
                setLogs(prev => [...prev, `--- Saving logs to ${dumpFile} ---`]);
            }
        } catch (e) {
            feedback.toast.error(t('toolbox.dmesg.start_error', "Failed to start dmesg"), e);
        }
    };

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const [lastSavedFile, setLastSavedFile] = useState<string | null>(null);

    const stopDmesg = async () => {
        try {
            await invoke('stop_dmesg', { device: selectedDevice });
            if (!isMounted.current) return;
            setIsStreaming(false);
            if (currentDumpFile) {
                setLogs(prev => [...prev, `${t('feedback.saved_to_prefix')} ${currentDumpFile}`]);
                feedback.toast.success(t('toolbox.dmesg.saved', 'Dmesg logs saved'));
                setLastSavedFile(currentDumpFile);
                setCurrentDumpFile(null);
            }
        } catch (e) {
            feedback.toast.error(t('toolbox.dmesg.stop_error', "Failed to stop dmesg"), e);
        }
    };

    const handleAiAnalyze = async () => {
        if (logs.length === 0 || isAiLoading) return;

        const currentLang = i18n.language || 'en';
        setIsAiLoading(true);
        setIsAiModalOpen(true);
        setAiError(null);
        setAiResult(null);

        const lastLogs = logs.slice(-100).join('\n');
        const prompt = `Analyze the following Android Kernel Log (dmesg) output. Identify potential kernel panics, hardware errors, out-of-memory killer events, or hardware driver issues. Provide a summary and then a detailed analysis. Respond in ${currentLang}.\n\nLOGS:\n${lastLogs}`;
        const systemInstruction = `You are an expert Android Platform Developer and Linux Kernel Engineer. Analyze dmesg snippets precisely. Always provide your response in ${currentLang}. Use the exact prefix "Summary: " followed by an EXTREMELY CONCISE one-line summary (MAXIMUM 15 WORDS).`;

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
                <p>{t('toolbox.dmesg.select_device', 'Select a device to view Kernel Logs')}</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full flex-1 min-h-0 flex flex-col p-2">
            <Section
                title={t('toolbox.dmesg.title', 'Kernel Logs (dmesg)')}
                icon={AlignLeft}
                variant="transparent"
                className="pb-2 mb-2 p-2"
                status={
                    <div className="flex items-center gap-3">
                        {!settings.paths.logcat && (
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
                        <div className="text-xs text-on-surface/80">
                            {logs.length} {t('logcat.lines', 'lines')}
                            <Button
                                onClick={() => { setLogs([]); }}
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
                }
                actions={
                    <div className="flex gap-2">
                        <Button
                            onClick={isStreaming ? stopDmesg : startDmesg}
                            variant={isStreaming ? "danger" : "primary"}
                            size="sm"
                            disabled={isTestRunning && !allowActionsDuringTest}
                            leftIcon={isStreaming ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        >
                            {!isNarrow && (isStreaming ? t('common.stop', 'Stop') : t('common.start', 'Start'))}
                        </Button>
                        <AiButton
                            id="dmesg_analysis"
                            isLoading={isAiLoading}
                            onClick={handleAiAnalyze}
                            label={t('toolbox.dmesg.analyze_ai', 'Analyze with AI')}
                            variant="secondary"
                            size="sm"
                            disabled={logs.length === 0 || isAiLoading}
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

            <div className="flex-1 min-h-0 bg-surface text-on-surface/80 font-mono text-xs relative border border-outline-variant/30 rounded-2xl">
                {logs.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/80 font-sans text-sm">
                        <AlignLeft size={32} className="opacity-20 mb-2" />
                        <p>
                            {isTestRunning ? t('logcat.paused_during_test', "Paused during test") :
                                isStreaming ? t('toolbox.dmesg.waiting', "Waiting for kernel logs...") : t('toolbox.dmesg.no_logs', "No logs. Click Start.")}
                        </p>
                    </div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        data={logs}
                        className="custom-scrollbar"
                        followOutput="auto"
                        atBottomThreshold={50}
                        itemContent={(_, log) => (
                            <div className="on-primaryspace-pre-wrap hover:bg-surface-variant/30 px-2 py-0.5 break-all transition-colors">
                                {log.startsWith(t('feedback.saved_to_prefix')) ? (
                                    <span
                                        className="text-primary dark:text-primary/80 underline cursor-pointer hover:opacity-80"
                                        onClick={() => invoke('open_path', { path: log.replace(t('feedback.saved_to_prefix') + ' ', '') })}
                                        data-tooltip={t('logcat.open_file', 'Click to open file')}
                                        data-position="top"
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

            <Modal
                isOpen={isAiModalOpen}
                onClose={() => setIsAiModalOpen(false)}
                title={t('toolbox.dmesg.ai_analysis_title', 'Kernel Log AI Analysis')}
                className="max-w-2xl"
            >
                <div className="space-y-4">
                    <AiResponse
                        title={aiResult?.summary || t('ai.analyzing', 'Analyzing...')}
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
        </div >
    );
}
