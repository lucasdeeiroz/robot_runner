import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { XCircle, CheckCircle2, Calendar, Clock, Smartphone, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCachedResult, parseXmlBackground, onParseComplete } from '@/lib/xmlParseCache';
import { Modal } from '@/components/organisms/Modal';
import { LogTree } from '@/components/molecules/LogTree';
import { LogNode } from '@/lib/robotParser';
import { feedback } from '@/lib/feedback';
import { AndroidVersionPill } from '@/components/atoms/AndroidVersionPill';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { decodeHtml } from '@/lib/utils';
import { AiButton } from '@/components/atoms/AiButton';
import { AiResponse } from '@/components/molecules/AiResponse';
import { useSettings } from '@/lib/settings';
import { TestLog } from '@/lib/historyCache';
import * as gemini from '@/lib/dashboard/gemini';
import * as openai from '@/lib/dashboard/openai';
import * as claude from '@/lib/dashboard/claude';
import clsx from 'clsx';


interface ParseProgress {
    xml_path: string;
    stage: string;
    percent: number;
}

const STAGE_KEYS: Record<string, string> = {
    parsing_xml: 'run_tab.console.progress_parsing_xml',
    mapping_structure: 'run_tab.console.progress_mapping_structure',
    compressing_cache: 'run_tab.console.progress_compressing_cache',
    loading_tree: 'run_tab.console.progress_loading_tree',
};

interface HistoryDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    log: TestLog | null;
    onUpdateLog: (updatedLog: TestLog) => void;
}

export function HistoryDetailModal({ isOpen, onClose, log, onUpdateLog }: HistoryDetailModalProps) {
    const { t, i18n } = useTranslation();
    const [tree, setTree] = useState<LogNode[]>([]);
    const [dbPath, setDbPath] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<ParseProgress | null>(null);
    const unlistenRef = useRef<UnlistenFn | null>(null);
    const currentPathRef = useRef<string | null>(null);
    const { settings } = useSettings();

    // AI Summary State
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    // Sync summary when log changes
    useEffect(() => {
        if (isOpen && log) {
            setSummary(log.ai_summary || null);
            setSummaryError(null);
        }
    }, [isOpen, log]);

    // Cleanup event listener
    const cleanupListener = useCallback(() => {
        if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
        }
    }, []);

    const loadXml = useCallback(async (xmlPath: string) => {
        currentPathRef.current = xmlPath;

        // 1. Check global cache for instant display
        const cached = getCachedResult(xmlPath);
        if (cached) {
            setTree([cached.rootSuite]);
            setDbPath(cached.dbPath);
            setLoading(false);
            return;
        }

        // 2. Start loading with progress
        setLoading(true);
        setProgress(null);

        cleanupListener();
        unlistenRef.current = await listen<ParseProgress>('xml-parse-progress', (event) => {
            if (event.payload.xml_path === currentPathRef.current) {
                setProgress(event.payload);
            }
        });

        try {
            // parseXmlBackground deduplicates and caches globally
            const result = await parseXmlBackground(xmlPath);
            // Only update if still viewing the same path (not closed or changed)
            if (currentPathRef.current === xmlPath) {
                setTree([result.rootSuite]);
                setDbPath(result.dbPath);
            }
        } catch (e) {
            if (currentPathRef.current === xmlPath) {
                console.error("Failed to parse history XML via backend:", e);
                feedback.toast.error("common.errors.parse_failed");
            }
        } finally {
            if (currentPathRef.current === xmlPath) {
                setLoading(false);
                setProgress(null);
                cleanupListener();
            }
        }
    }, [cleanupListener]);

    useEffect(() => {
        if (isOpen && log && log.xml_path) {
            loadXml(log.xml_path);
        } else if (!isOpen) {
            // When closing, DO NOT cancel the parse — it continues in the cache.
            // Only reset local UI state.
            setTree([]);
            setDbPath(undefined);
            setProgress(null);
            cleanupListener();
            currentPathRef.current = null;
        }
        return cleanupListener;
    }, [isOpen, log, cleanupListener, loadXml]);

    // Subscribe to parse completions so re-opening picks up cached results
    useEffect(() => {
        const unsubscribe = onParseComplete((xmlPath, result, _error) => {
            if (xmlPath === currentPathRef.current && result) {
                setTree([result.rootSuite]);
                setDbPath(result.dbPath);
                setLoading(false);
                setProgress(null);
                cleanupListener();
            }
        });
        return unsubscribe;
    }, [cleanupListener]);

    const openLog = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            feedback.toast.error("common.errors.open_file_failed", e);
        }
    };

    const handleChildrenLoaded = useCallback((id: string, children: LogNode[]) => {
        const updateNode = (nodes: LogNode[]): boolean => {
            for (const n of nodes) {
                if (n.id === id) {
                    // Type narrowing: only update if it can have children
                    if (n.type === 'suite' || n.type === 'test' || n.type === 'keyword') {
                        (n as any).children = children;
                        return true;
                    }
                }
                const nodeWithChildren = n as any;
                if (nodeWithChildren.children && Array.isArray(nodeWithChildren.children)) {
                    if (updateNode(nodeWithChildren.children)) return true;
                }
            }
            return false;
        };

        const newTree = [...tree];
        if (updateNode(newTree)) {
            setTree(newTree);
        }
    }, [tree]);

    const handleSummarize = async (customPrompt?: string) => {
        if (!log || tree.length === 0 || isSummarizing) return;

        setIsSummarizing(true);
        setSummaryError(null);
        setSummary(null);

        try {
            const provider = settings.aiProvider || 'gemini';
            let apiKey: string | undefined;
            let model: string | undefined;

            if (provider === 'openai') {
                apiKey = settings.openaiApiKey;
                model = settings.openaiModel;
            } else if (provider === 'claude') {
                apiKey = settings.claudeApiKey;
                model = settings.claudeModel;
            } else {
                apiKey = settings.geminiApiKey;
                model = settings.geminiModel;
            }

            if (!apiKey) {
                throw new Error("Missing API Key");
            }

            let result: string;
            const language = i18n.language || 'en';

            // Fetch failure context from DB if available
            let failureContext: any[] | undefined = undefined;
            if (dbPath) {
                try {
                    failureContext = await invoke('get_execution_failures', { dbPath });
                } catch (dbErr) {
                    console.warn("Failed to fetch failure context for AI:", dbErr);
                }
            }

            if (provider === 'openai') {
                result = await openai.summarizeExecution(tree, apiKey, model, language, failureContext, undefined, customPrompt);
            } else if (provider === 'claude') {
                result = await claude.summarizeExecution(tree, apiKey, model, language, failureContext, undefined, customPrompt);
            } else {
                result = await gemini.summarizeExecution(tree, apiKey, model, language, failureContext, undefined, customPrompt);
            }

            setSummary(result);

            // Persist to history cache e atualiza estado local
            try {
                await invoke('save_test_summary', {
                    xmlPath: log.xml_path,
                    summary: result,
                    customPath: settings.paths.logs
                });

                // Notifica o componente pai sobre a atualização
                onUpdateLog({ ...log, ai_summary: result });
            } catch (saveErr) {
                console.error("Failed to persist AI summary:", saveErr);
            }

        } catch (err: any) {
            console.error("AI summarization failed:", err);
            setSummaryError(err.message || String(err));
            feedback.toast.error("run_tab.console.ai_analysis_error");
        } finally {
            setIsSummarizing(false);
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            }).format(date);
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={log ? decodeHtml(log.suite_name) : ""}
            className="max-w-6xl h-[90vh]"
        >
            {log && (
                <div className="flex flex-col h-full">
                    {/* Header Info */}
                    <div className="flex flex-wrap gap-4 p-4 mb-4 bg-surface-variant/20 rounded-2xl border border-outline-variant/30">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <div className={clsx(
                                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                                    log.status === 'PASS' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                                )}>
                                    {log.status === 'PASS' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                </div>
                                <span className={clsx("font-bold text-sm", log.status === 'PASS' ? "text-success" : "text-error")}>
                                    {t(`run_tab.console.${log.status.toLowerCase()}`)}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-on-surface-variant/80">
                                <Calendar size={14} /> {formatDate(log.timestamp)}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-on-surface-variant/80">
                                <Clock size={14} />
                                <span>{log.duration}</span>
                                <span className="mx-1 opacity-20 h-2 w-[1px] bg-current" />
                                <span className="text-success font-medium">{log.pass_count}P</span>
                                <span className="opacity-30">/</span>
                                <span className={clsx("font-medium", log.fail_count > 0 ? "text-error" : "opacity-40")}>{log.fail_count}F</span>
                            </div>

                            {(log.device_model || log.device_udid) && (
                                <div className="flex items-center gap-2 text-xs text-on-surface/80">
                                    <Smartphone size={14} />
                                    {log.android_version && <AndroidVersionPill version={log.android_version} className="bg-surface-variant/50" />}
                                    {log.device_model || t('tests_page.unknown_model')}
                                    {log.device_udid ? ` (${log.device_udid})` : ''}
                                </div>
                            )}
                            <button
                                onClick={() => openLog(log.path)}
                                className="p-1 hover:bg-surface-variant/30 rounded transition-colors text-on-surface-variant/80 hover:text-primary"
                                title={t('run_tab.console.open_output_dir')}
                            >
                                <FolderOpen size={14} />
                            </button>
                        </div>

                        <div className="flex-1" />

                        <div className="flex items-center gap-2">
                            <AiButton
                                id="history_summarize"
                                isLoading={isSummarizing}
                                onClick={(_e, customPrompt) => handleSummarize(customPrompt)}
                                label={t('run_tab.console.summarize_run')}
                                variant="primary"
                                disabled={tree.length === 0 || loading}
                            />
                        </div>
                    </div>

                    {/* Content / Tree */}
                    <div className="flex-1 min-h-0">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-80 overflow-y-auto">
                                {(isSummarizing || summary || summaryError) && (
                                    <div className="w-full mb-6 px-3">
                                        <AiResponse
                                            title={t('run_tab.console.summary_title')}
                                            isLoading={isSummarizing}
                                            responseTitle={t('run_tab.console.summary_rationale')}
                                            response={summary}
                                            error={summaryError}
                                            onCopy={() => { }}
                                        />
                                    </div>
                                )}
                                <ExpressiveLoading size="md" variant="circular" />
                                <div className="flex flex-col items-center gap-2 w-64">
                                    <span className="text-sm font-medium animate-pulse">
                                        {progress && STAGE_KEYS[progress.stage]
                                            ? t(STAGE_KEYS[progress.stage])
                                            : t('run_tab.console.loading_xml')}
                                    </span>
                                    {progress && (
                                        <div className="w-full flex flex-col items-center gap-1.5">
                                            <div className="w-full h-1.5 bg-surface-variant/40 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                                                    style={{ width: `${progress.percent}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-on-surface-variant/60">{progress.percent}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : tree.length > 0 ? (
                            <div className="h-full overflow-y-auto space-y-3 pb-8 px-4 custom-scrollbar">
                                {(isSummarizing || summary || summaryError) && (
                                    <div className="mb-6">
                                        <AiResponse
                                            title={t('run_tab.console.summary_title')}
                                            isLoading={isSummarizing}
                                            responseTitle={t('run_tab.console.summary_rationale')}
                                            response={summary}
                                            error={summaryError}
                                            onCopy={() => { }}
                                        />
                                    </div>
                                )}
                                {tree.map(node => (
                                    <LogTree
                                        key={node.id}
                                        node={node}
                                        initiallyOpen={true}
                                        dbPath={dbPath}
                                        onChildrenLoaded={handleChildrenLoaded}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-on-surface-variant opacity-50">
                                <XCircle size={40} strokeWidth={1} />
                                <span className="text-sm font-medium">{t('tests_page.no_logs')}</span>
                            </div>
                        )}
                    </div>
                </div>
            )
            }
        </Modal >
    );
}
