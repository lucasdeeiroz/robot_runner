import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Star, Eye, EyeOff, Terminal, X, FolderOpen, Bot, Play, Pause, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { parseXmlBackground, invalidateCache } from "@/lib/xmlParseCache";
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
import * as antigravityCode from "@/lib/dashboard/antigravityCode";
import { useCallback } from "react";

interface RunConsoleProps {
    runId: string;
    logs: string[];
    isSessionRunning?: boolean;
    testPath?: string;
}

function parseCommandArgs(command: string): string[] {
    const args: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (const char of command) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }

        if (/\s/.test(char)) {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    if (escaped) {
        throw new Error('Invalid command: trailing escape character');
    }
    if (current.length > 0) args.push(current);
    return args;
}

export function RunConsole({ runId, logs, isSessionRunning: isRunning, testPath }: RunConsoleProps) {
    const { t, i18n } = useTranslation();
    const { sessions, setSessionTree, addSessionLog, markSessionFinished } = useTestSessions();
    const session = sessions.find(s => s.runId === runId);

    const [isRawMode, setIsRawMode] = useState(false);
    const [isKeepAwake, setIsKeepAwake] = useState(false);
    const [showDebugConsole, setShowDebugConsole] = useState(false);
    const [stickToBottom, setStickToBottom] = useState(true);

    const { settings } = useSettings();
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    // AI Agent State
    const [isAiLoopActive, setIsAiLoopActive] = useState(session?.isAiAgent || false);
    const [aiStatus, setAiStatus] = useState<string>("");
    const [aiHistory, setAiHistory] = useState<string[]>([]);
    const [aiStepCount, setAiStepCount] = useState(0);

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

    // Invalidate XML parsing cache for this session's output path when the test run starts
    useEffect(() => {
        if (isRunning && session?.outputDir) {
            const outputPath = session.outputDir;
            const outputXmlPath = session.outputXmlPath || `${outputPath.replace(/[\\/]+$/, "")}/output.xml`;
            invalidateCache(outputXmlPath);
        }
    }, [isRunning, session?.outputDir, session?.outputXmlPath]);

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
                
                // Invalidate XML parsing cache for this path to ensure we read the new test results
                invalidateCache(outputXmlPath);
                
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
            } else if (provider === 'antigravity-cli') {
                const { summarizeExecution } = await import('@/lib/dashboard/antigravityCode');
                result = await summarizeExecution(tree, settings.paths.automationRoot || '', language, failureContext?.map(f => f.message) || [], failureContext, customPrompt, settings.antigravityApiKey);
            }

            setSummary(result);
        } catch (err: any) {
            console.error("Summarization failed:", err);
            setSummaryError(err.message || "Failed to generate summary");
        } finally {
            setIsSummarizing(false);
        }
    };

    // AI Agent Autonomous Loop Logic
    const runAiStep = useCallback(async () => {
        const provider = settings.aiProvider || 'gemini';
        
        if (!session?.deviceUdid || !isAiLoopActive) return;
        
        // Key validation based on provider
        if (provider === 'gemini' && !settings.geminiApiKey) return;
        if (provider === 'openai' && !settings.openaiApiKey) return;
        if (provider === 'claude' && !settings.claudeApiKey) return;

        setAiStatus(t('run_tab.console.ai_steps.dumping', { defaultValue: 'Dumping screen hierarchy...' }));
        try {
            const xml = await invoke<string>("get_xml_dump", { deviceId: session.deviceUdid });
            
            setAiStatus(t('run_tab.console.ai_steps.thinking', { defaultValue: 'AI is thinking...' }));
            
            let response: gemini.AutonomousActionResponse;
            const target = session.aiPrompt || session.testPath;
            const lang = i18n.language;

            if (provider === 'gemini') {
                response = await gemini.generateAutonomousAction(xml, target, aiHistory, settings.geminiApiKey as string, settings.geminiModel || 'gemini-1.5-pro', lang);
            } else if (provider === 'openai') {
                response = await openai.generateAutonomousAction(xml, target, aiHistory, settings.openaiApiKey as string, settings.openaiModel || 'gpt-4o', lang);
            } else if (provider === 'claude') {
                response = await claude.generateAutonomousAction(xml, target, aiHistory, settings.claudeApiKey as string, settings.claudeModel || 'claude-3-5-sonnet-latest', lang);
            } else if (provider === 'antigravity-cli') {
                response = await antigravityCode.generateAutonomousAction(xml, target, aiHistory, settings.paths.automationRoot || '', lang, undefined, settings.antigravityApiKey);
            } else if (provider === 'claude-code') {
                response = await claudeCli.generateAutonomousAction(xml, target, aiHistory, settings.paths.automationRoot || '', lang, undefined, settings.claudeCodeToken);
            } else {
                throw new Error(`Unsupported AI provider for Autonomous Agent: ${provider}`);
            }

            const actionDesc = `[Step ${aiStepCount + 1}] ${response.action.type.toUpperCase()}: ${response.action.details}`;
            setAiHistory(prev => [...prev, actionDesc]);
            setAiStepCount(prev => prev + 1);

            addSessionLog(runId, `[AI Agent] Thought: ${response.thought}`);
            addSessionLog(runId, `[AI Agent] Action: ${response.action.details}`);

            if (response.action.type === 'finish') {
                setIsAiLoopActive(false);
                setAiStatus(t('run_tab.console.ai_steps.finished', { defaultValue: 'Goal completed successfully!' }));
                addSessionLog(runId, `[System] AI Agent mission completed.`);
                markSessionFinished(runId, '0');
                return;
            }

            if (response.action.type === 'fail') {
                setIsAiLoopActive(false);
                setAiStatus(t('run_tab.console.ai_steps.failed', { defaultValue: 'AI Agent failed to complete the goal.' }));
                addSessionLog(runId, `[Error] AI Agent aborted: ${response.action.details}`);
                markSessionFinished(runId, '1');
                return;
            }

            if (response.action.command) {
                setAiStatus(t('run_tab.console.ai_steps.executing', { action: response.action.details, defaultValue: `Executing: ${response.action.details}` }));

                const rawCommand = response.action.command.trim();
                const parsedArgs = parseCommandArgs(rawCommand);
                let args = [...parsedArgs];
                if (args[0] === 'adb') args = args.slice(1);
                if (args[0] === '-s' && args.length >= 2) args = args.slice(2);
                if (args.length === 0) {
                    throw new Error('AI returned an empty ADB command');
                }
                await invoke("run_adb_command", { device: session.deviceUdid, args });
                addSessionLog(runId, `[ADB] Executed: adb -s ${session.deviceUdid} ${args.join(' ')}`);
            } else if (response.action.type === 'wait') {
                setAiStatus(t('run_tab.console.ai_steps.waiting', { defaultValue: 'Waiting for transition...' }));
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (e: any) {
            console.error("AI Step failed:", e);
            const errorMsg = e.message || String(e);
            setAiStatus(`Error: ${errorMsg}`);
            addSessionLog(runId, `[Error] AI Step failed: ${errorMsg}`);
            setIsAiLoopActive(false);
            markSessionFinished(runId, '1');
        }
    }, [runId, session?.deviceUdid, session?.aiPrompt, session?.testPath, settings, isAiLoopActive, aiHistory, aiStepCount, i18n.language, t, addSessionLog, markSessionFinished]);

    useEffect(() => {
        let timeoutId: any;
        if (isAiLoopActive) {
            timeoutId = setTimeout(runAiStep, 1500); // Small delay between steps
        }
        return () => clearTimeout(timeoutId);
    }, [isAiLoopActive, aiStepCount, runAiStep]);


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
                    {session?.isAiAgent && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-lg border border-primary/20 animate-pulse-slow">
                            <Bot size={14} className="text-primary" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">AI AGENT MODE</span>
                            <div className="h-3 w-[1px] bg-primary/20 mx-1" />
                            <span className="text-[10px] text-on-surface-variant/70 font-medium">{aiStatus || 'Initializing...'}</span>
                            <button
                                onClick={() => setIsAiLoopActive(!isAiLoopActive)}
                                className={clsx(
                                    "ml-2 p-1 rounded-md transition-all hover:scale-110",
                                    isAiLoopActive ? "text-error hover:bg-error/10" : "text-success hover:bg-success/10"
                                )}
                                title={isAiLoopActive ? t('common.pause') : t('common.start')}
                            >
                                {isAiLoopActive ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                            </button>
                            <button
                                onClick={() => {
                                    setAiHistory([]);
                                    setAiStepCount(0);
                                    setIsAiLoopActive(true);
                                }}
                                className="p-1 text-on-surface-variant/60 hover:text-primary rounded-md hover:bg-primary/10 transition-all"
                                title={t('common.reset')}
                            >
                                <RefreshCw size={12} />
                            </button>
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
                        itemContent={(i, line) => {
                            if (line.startsWith('[AI Agent] Thought:')) {
                                const content = line.replace('[AI Agent] Thought:', '').trim();
                                return (
                                    <div className="whitespace-pre-wrap break-words hover:bg-surface-variant/10 px-6 py-0.5 rounded transition-colors border-l-2 border-transparent hover:border-primary/30 flex">
                                        <span className="text-on-surface-variant/40 mr-3 select-none w-8 inline-block text-right tabular-nums shrink-0">{i + 1}</span>
                                        <span className="flex-1 min-w-0 break-words text-primary font-semibold">
                                            [AI Agent] Thought: <span className="text-primary/80 font-normal">{content}</span>
                                        </span>
                                    </div>
                                );
                            }
                            if (line.startsWith('[AI Agent] Action:')) {
                                const content = line.replace('[AI Agent] Action:', '').trim();
                                return (
                                    <div className="whitespace-pre-wrap break-words hover:bg-surface-variant/10 px-6 py-0.5 rounded transition-colors border-l-2 border-transparent hover:border-secondary/30 flex">
                                        <span className="text-on-surface-variant/40 mr-3 select-none w-8 inline-block text-right tabular-nums shrink-0">{i + 1}</span>
                                        <span className="flex-1 min-w-0 break-words text-secondary font-semibold">
                                            [AI Agent] Action: <span className="text-secondary/80 font-normal">{content}</span>
                                        </span>
                                    </div>
                                );
                            }
                            if (line.startsWith('[ADB] Executed:')) {
                                const content = line.replace('[ADB] Executed:', '').trim();
                                return (
                                    <div className="whitespace-pre-wrap break-words hover:bg-surface-variant/10 px-6 py-0.5 rounded transition-colors border-l-2 border-transparent hover:border-tertiary/30 flex">
                                        <span className="text-on-surface-variant/40 mr-3 select-none w-8 inline-block text-right tabular-nums shrink-0">{i + 1}</span>
                                        <span className="flex-1 min-w-0 break-words text-tertiary font-semibold">
                                            [ADB] Executed: <span className="text-tertiary/80 font-normal">{content}</span>
                                        </span>
                                    </div>
                                );
                            }
                            return (
                                <div className="whitespace-pre-wrap break-words hover:bg-surface-variant/10 px-6 py-0.5 rounded transition-colors border-l-2 border-transparent hover:border-primary/30 flex">
                                    <span className="text-on-surface-variant/40 mr-3 select-none w-8 inline-block text-right tabular-nums shrink-0">{i + 1}</span>
                                    <span className={clsx(
                                        "flex-1 min-w-0 break-words",
                                        line.includes('| PASS |') && "text-success font-semibold",
                                        line.includes('| FAIL |') && "text-error font-semibold",
                                        line.includes('| SKIP |') && "text-warning font-semibold",
                                        (line.includes('[System]') || line.includes('[RR-')) && "text-on-surface-variant/60 italic"
                                    )}>
                                        {line}
                                    </span>
                                </div>
                            );
                        }}
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
                    <div className="absolute bottom-0 left-0 right-3 z-50 animate-in slide-in-from-bottom-8 fade-in duration-500 bg-surface">
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
