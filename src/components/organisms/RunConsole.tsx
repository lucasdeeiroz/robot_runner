import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Star, Eye, EyeOff, Terminal, X, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { parseXmlBackground } from "@/lib/xmlParseCache";
import { parseHeuristicLogs } from "@/lib/heuristicParser";
import { LogNode, LinearNode } from "@/lib/robotParser";
import { LogTree } from "@/components/molecules/LogTree";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { useTestSessions } from "@/lib/testSessionStore";
import { AiButton } from "@/components/atoms/AiButton";
import { AiResponse } from "@/components/molecules/AiResponse";
import { useSettings } from "@/lib/settings";
import * as gemini from "@/lib/dashboard/gemini";
import * as openai from "@/lib/dashboard/openai";
import * as claude from "@/lib/dashboard/claude";
import * as claudeCli from "@/lib/dashboard/claudeCode";
import { useCallback } from "react";

interface RunConsoleProps {
    runId: string;
    logs: string[];
    isSessionRunning?: boolean;
    testPath?: string;
}

export function RunConsole({ runId, logs, isSessionRunning: isRunning, testPath }: RunConsoleProps) {
    const { t, i18n } = useTranslation();
    const { sessions, setSessionTree } = useTestSessions();
    const session = sessions.find(s => s.runId === runId);

    const [isRawMode, setIsRawMode] = useState(false);
    const [isKeepAwake, setIsKeepAwake] = useState(false);
    const [showDebugConsole, setShowDebugConsole] = useState(false);
    const [stickToBottom, setStickToBottom] = useState(true);

    const { settings } = useSettings();
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    const rawContainerRef = useRef<VirtuosoHandle>(null);
    const fancyContainerRef = useRef<HTMLDivElement>(null);
    const debugVirtuosoRef = useRef<VirtuosoHandle>(null);
    const [tree, setTree] = useState<LogNode[]>(() => session?.repopulatedTree ? [session.repopulatedTree] : []);

    const handleChildrenLoaded = useCallback((id: string, children: LogNode[]) => {
        // Find node in tree and attach children so flattenLogNodes can see them
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

    // Sync state with session store when background updates happen (e.g. artifacts detected)
    useEffect(() => {
        if (session?.repopulatedTree && tree.length === 0) {
            setTree([session.repopulatedTree]);
        }
    }, [session?.repopulatedTree]);

    // Handle auto-scroll logic
    useEffect(() => {
        if (!stickToBottom || showDebugConsole) return;

        if (isRawMode) {
            rawContainerRef.current?.scrollToIndex({
                index: logs.length - 1,
                behavior: 'auto',
            });
        } else {
            if (fancyContainerRef.current) {
                fancyContainerRef.current.scrollTop = fancyContainerRef.current.scrollHeight;
            }
        }
    }, [logs.length, tree.length, isRawMode, stickToBottom, showDebugConsole]);

    // Keep Screen Awake Lifecycle
    useEffect(() => {
        const handleWakeLock = async (enable: boolean) => {
            try {
                await invoke('toggle_wakelock', { enabled: enable });
            } catch (err) {
                console.error('WakeLock error:', err);
            }
        };

        const onVisibilityChange = () => {
            if (document.hidden) {
                handleWakeLock(false);
            } else if (isKeepAwake) {
                handleWakeLock(true);
            }
        };

        const onBlur = () => handleWakeLock(false);
        const onFocus = () => isKeepAwake && handleWakeLock(true);

        if (isKeepAwake) {
            handleWakeLock(true);
            document.addEventListener('visibilitychange', onVisibilityChange);
            window.addEventListener('blur', onBlur);
            window.addEventListener('focus', onFocus);
        } else {
            handleWakeLock(false);
        }

        return () => {
            handleWakeLock(false);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        };
    }, [isKeepAwake]);

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        if (isNearBottom !== stickToBottom) {
            setStickToBottom(isNearBottom);
        }
    };

    // Persistent Parsing Context
    const parsedNodesRef = useRef<LinearNode[]>([]);
    const processedCountRef = useRef<number>(0);

    // Track if post-test re-parse is in progress
    const [reparseLoading, setReparseLoading] = useState(false);

    useEffect(() => {
        // Skip if running, or no output path, or tree is already officially repopulated
        if (isRunning || !session?.outputDir || !!session?.repopulatedTree) return;

        let cancelled = false;

        const parseOutputXml = async () => {
            setReparseLoading(true);
            try {
                // Try to find the detected output XML from logs first, then fallback to output.xml
                const outputPath = session.outputDir!;
                const outputXmlPath = session.outputXmlPath || `${outputPath.replace(/[\\/]+$/, "")}/output.xml`;
                const result = await parseXmlBackground(outputXmlPath);
                if (!cancelled && result) {
                    setTree([result.rootSuite]);
                    setSessionTree(runId, result.rootSuite, result.dbPath);
                }
            } catch (e: any) {
                console.error("Failed to parse output.xml via backend:", e);
            } finally {
                if (!cancelled) setReparseLoading(false);
            }
        };

        parseOutputXml();
        return () => { cancelled = true; };
    }, [isRunning, session?.outputDir, session?.repopulatedTree]);

    const handleSummarize = async (customPrompt?: string) => {
        if (tree.length === 0 || isSummarizing) return;

        setIsSummarizing(true);
        setSummaryError(null);

        try {
            const provider = settings.aiProvider || 'gemini';
            const language = i18n.language || 'en';
            let result = "";

            // Fetch failure context from DB if available
            let failureContext: any[] | undefined = undefined;
            if (session?.parsedDbPath) {
                try {
                    failureContext = await invoke('get_execution_failures', { dbPath: session.parsedDbPath });
                } catch (dbErr) {
                    console.warn("Failed to fetch failure context for AI:", dbErr);
                }
            }

            if (provider === 'gemini') {
                if (!settings.geminiApiKey) throw new Error("Missing Gemini API Key");
                result = await gemini.summarizeExecution(tree, settings.geminiApiKey as string, settings.geminiModel || '', language, failureContext, undefined, customPrompt);
            } else if (provider === 'openai') {
                if (!settings.openaiApiKey) throw new Error("Missing OpenAI API Key");
                result = await openai.summarizeExecution(tree, settings.openaiApiKey as string, settings.openaiModel || '', language, failureContext, undefined, customPrompt);
            } else if (provider === 'claude') {
                if (!settings.claudeApiKey) throw new Error("Missing Claude API Key");
                result = await claude.summarizeExecution(tree, settings.claudeApiKey as string, settings.claudeModel || '', language, failureContext, undefined, customPrompt);
            } else if (provider === 'claude-code') {
                result = await claudeCli.summarizeExecution(tree, settings.paths.automationRoot || '', language, failureContext?.map(f => f.message) || [], failureContext, customPrompt, settings.claudeCodeToken);
            } else if (provider === 'gemini-code') {
                const { summarizeExecution } = await import('@/lib/dashboard/geminiCode');
                result = await summarizeExecution(tree, settings.paths.automationRoot || '', language, failureContext?.map(f => f.message) || [], failureContext, customPrompt, settings.geminiCodeApiKey);
            }

            setSummary(result);
        } catch (err: any) {
            console.error("Summarization failed:", err);
            setSummaryError(err.message || "Failed to generate summary");
        } finally {
            setIsSummarizing(false);
        }
    };

    // Heuristic Parsing Loop
    useEffect(() => {
        // Skip log parsing if we already have a repopped tree and the test is finished
        if (!isRunning && tree.length > 0 && (session?.repopulatedTree || session?.outputDir)) {
            processedCountRef.current = logs.length; // Mark all as processed
            return;
        }

        const currentCount = logs.length;
        const processedCount = processedCountRef.current;

        // Only clear if it's a fresh run or a reset
        if (currentCount < processedCount || (isRunning && currentCount === 0)) {
            parsedNodesRef.current = [];
            processedCountRef.current = 0;
            setTree([]);
            return;
        }

        // If nothing new, exit early
        if (currentCount === processedCount) return;

        // Use the modular heuristic parser
        const result = parseHeuristicLogs(logs, parsedNodesRef.current, processedCount);

        parsedNodesRef.current = result.parsedNodes;
        processedCountRef.current = result.processedCount;

        // Update tree only if we haven't officially repopulated yet
        if (!session?.repopulatedTree) {
            setTree(result.tree);
        }

        // Auto-detect output XML from logs
        if (result.outputXmlPath || result.outputDir) {
            setSessionTree(runId, undefined, undefined, result.outputDir, result.outputXmlPath);
        }

    }, [logs, isRunning, runId, session?.repopulatedTree]);

    // Definitively update tree when session.repopulatedTree arrives
    useEffect(() => {
        if (session?.repopulatedTree) {
            setTree([session.repopulatedTree]);
        }
    }, [session?.repopulatedTree]);

    return (
        <div className="h-full flex-1 min-h-0 flex flex-col bg-surface rounded-2xl font-mono text-sm border border-outline-variant/30 shadow-inner pointer-events-auto relative z-0 isolate overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-outline-variant/30 bg-surface/80 backdrop-blur shrink-0 z-20">
                <span className="text-xs text-on-surface-variant/80 font-mono truncate px-2" title={testPath}>{testPath}</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsRawMode(!isRawMode)}
                        className="p-1 hover:bg-surface-variant/30 rounded transition-colors text-on-surface-variant/80 hover:text-warning"
                        title={isRawMode ? t('run_tab.console.fancy_mode') : t('run_tab.console.raw_mode')}
                    >
                        <Star size={14} fill={!isRawMode ? "currentColor" : "none"} className={clsx(!isRawMode && "text-warning-container/40")} />
                    </button>
                    <button
                        onClick={() => setShowDebugConsole(!showDebugConsole)}
                        className={clsx(
                            "p-1 hover:bg-surface-variant/30 rounded transition-colors",
                            showDebugConsole ? "text-primary bg-primary/10" : "text-on-surface-variant/80 hover:text-primary"
                        )}
                        title={showDebugConsole ? t('run_tab.console.debug_off') : t('run_tab.console.debug_on')}
                    >
                        <Terminal size={14} />
                    </button>
                    <button
                        onClick={() => setIsKeepAwake(!isKeepAwake)}
                        className={clsx(
                            "p-1 hover:bg-surface-variant/30 rounded transition-colors",
                            isKeepAwake ? "text-primary" : "text-on-surface-variant/80 hover:text-primary"
                        )}
                        title={t('run_tab.console.keep_awake')}
                    >
                        {isKeepAwake ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    {!isRunning && tree.length > 0 && (
                        <div className="flex items-center gap-1">
                            {session?.outputDir && (
                                <button
                                    onClick={async () => {
                                        let path = session.outputDir!;
                                        // Safety check: ensure we open a directory, not a file
                                        if (path.toLowerCase().endsWith('.xml') || path.toLowerCase().endsWith('.html')) {
                                            const normalized = path.replace(/[\\/]+$/, "");
                                            const lastSeparator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
                                            if (lastSeparator >= 0) {
                                                path = normalized.slice(0, lastSeparator) || normalized;
                                            }
                                        }
                                        try {
                                            await invoke('open_log_folder', { path });
                                        } catch (e) {
                                            console.error("Failed to open log folder:", e);
                                        }
                                    }}
                                    className="p-1 hover:bg-surface-variant/30 rounded transition-colors text-on-surface-variant/80 hover:text-primary"
                                    title={t('run_tab.console.open_output_dir')}
                                >
                                    <FolderOpen size={14} />
                                </button>
                            )}
                            <AiButton
                                id="run_summary"
                                isLoading={isSummarizing}
                                onClick={(_e, customPrompt) => handleSummarize(customPrompt)}
                                label={t('run_tab.console.summarize_run')}
                                variant="primary"
                                className="h-6"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col relative">
                <div
                    className={clsx(
                        "flex-1 min-h-0 font-mono text-[13px] leading-relaxed relative",
                        isRawMode ? "block" : "hidden"
                    )}
                >
                    <Virtuoso
                        ref={rawContainerRef}
                        data={logs}
                        followOutput="auto"
                        onScroll={onScroll}
                        className="custom-scrollbar"
                        itemContent={(i, line) => (
                            <div className="whitespace-pre-wrap break-all hover:bg-surface-variant/10 px-6 py-0.5 rounded transition-colors border-l-2 border-transparent hover:border-primary/30">
                                <span className="text-on-surface-variant/40 mr-3 select-none w-8 inline-block text-right tabular-nums">{i + 1}</span>
                                <span className={clsx(
                                    line.includes('| PASS |') && "text-success font-semibold",
                                    line.includes('| FAIL |') && "text-error font-semibold",
                                    line.includes('| SKIP |') && "text-warning font-semibold",
                                    (line.includes('[System]') || line.includes('[RR-')) && "text-on-surface-variant/60 italic"
                                )}>
                                    {line}
                                </span>
                            </div>
                        )}
                        components={{
                            Footer: () => isRunning ? (
                                <div className="flex items-center gap-2 text-primary/60 my-4 px-6 animate-pulse">
                                    <Terminal size={14} className="animate-bounce" />
                                    <span className="text-xs font-bold tracking-wider uppercase italic">Streaming live output...</span>
                                </div>
                            ) : <div className="h-10" />
                        }}
                    />
                </div>

                {!isRawMode && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar" ref={fancyContainerRef} onScroll={onScroll}>
                            <div className="p-4 min-h-full">
                                {tree.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-on-surface-variant/40 gap-4">
                                        {isRunning ? (
                                            <>
                                                <ExpressiveLoading size="lg" />
                                                <div className="text-center">
                                                    <p className="text-sm font-medium animate-pulse">{t('run_tab.console.waiting_logs')}</p>
                                                    <p className="text-xs opacity-60 mt-1">{t('run_tab.console.parsing_live')}</p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center group">
                                                <div className="w-16 h-16 rounded-full bg-surface-variant/10 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                                                    <Terminal size={32} className="opacity-20" />
                                                </div>
                                                <p className="text-sm italic">{t('run_tab.console.no_logs')}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="max-w-[1200px] mx-auto pb-20">
                                        {tree.map((node) => (
                                            <LogTree
                                                key={node.id}
                                                node={node}
                                                dbPath={session?.parsedDbPath}
                                                onChildrenLoaded={handleChildrenLoaded}
                                            />
                                        ))}
                                        {reparseLoading && (
                                            <div className="mt-8 flex items-center justify-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                <ExpressiveLoading size="sm" variant="circular" />
                                                <span className="text-xs text-primary/70 font-medium tracking-wide uppercase italic">{t('run_tab.console.optimizing_view')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Floating Summary UI */}
                {(summary || isSummarizing || summaryError) && (
                    <div className="absolute bottom-6 left-6 right-6 z-50 animate-in slide-in-from-bottom-8 fade-in duration-500">
                        <AiResponse
                            response={summary}
                            isLoading={isSummarizing}
                            error={summaryError}
                            onClose={() => {
                                setSummary(null);
                                setSummaryError(null);
                            }}
                            title={t('run_tab.console.ai_analysis')}
                            onRetry={handleSummarize}
                        />
                    </div>
                )}
            </div>

            {showDebugConsole && (
                <div className="h-1/3 border-t border-outline-variant/30 bg-surface/95 backdrop-blur-md flex flex-col animate-in slide-in-from-bottom duration-300 z-30">
                    <div className="flex items-center justify-between p-2 bg-surface-variant/10 shrink-0">
                        <div className="flex items-center gap-2 px-2">
                            <Terminal size={14} className="text-primary" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">{t('run_tab.console.debug_output')}</span>
                        </div>
                        <button
                            onClick={() => setShowDebugConsole(false)}
                            className="p-1 hover:bg-surface-variant/30 rounded text-on-surface-variant/60"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 p-3 font-mono text-[11px] leading-relaxed overflow-y-auto custom-scrollbar bg-black/5 shadow-inner">
                        <Virtuoso
                            ref={debugVirtuosoRef}
                            data={logs}
                            followOutput="auto"
                            itemContent={(index, line) => (
                                <div className="whitespace-pre-wrap break-all py-0.5 border-l border-outline-variant/10 pl-3 mb-0.5 hover:bg-primary/5 transition-colors">
                                    <span className="text-on-surface-variant/30 mr-3 select-none inline-block w-8 text-right tabular-nums">{index + 1}</span>
                                    <span className={clsx(
                                        line.includes('[System]') && "text-primary/60",
                                        line.includes('[Error]') && "text-error font-bold",
                                        line.includes('[RR-') && "text-secondary/60 italic"
                                    )}>
                                        {line}
                                    </span>
                                </div>
                            )}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
