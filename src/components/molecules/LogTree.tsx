import React, { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
    ChevronRight, ChevronDown, CheckCircle2, XCircle, MinusCircle,
    Layers, BugPlay, CirclePlay, Repeat, IterationCcw, Workflow,
    Infinity, Split, StepForward, CalendarCog, Maximize2,
    ShieldAlert, Anchor, Hand, CircleSlash, Info, CornerDownRight
} from "lucide-react";
import { LogNode, TestNode, KeywordNode, SuiteNode } from "@/lib/robotParser";
import { LinkRenderer } from "../molecules/LinkRenderer";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { useSettings } from "@/lib/settings";
import { askGemini } from "@/lib/dashboard/gemini";
import { askClaude } from "@/lib/dashboard/claude";
import { askOpenAI } from "@/lib/dashboard/openai";
import { askClaudeCode } from "@/lib/dashboard/claudeCode";
import { feedback } from "@/lib/feedback";
import { AiButton } from "../atoms/AiButton";
import { AiResponse } from "./AiResponse";
import { getFailureAnalysisPrompt } from "@/lib/dashboard/prompts";

interface LogTreeProps {
    node: LogNode;
    depth?: number;
    initiallyOpen?: boolean;
    dbPath?: string;
    parentType?: LogNode['type'];
    isFlatRow?: boolean;
    isExpanded?: boolean;
    isLast?: boolean;
    onToggleExpand?: (id: string, expanded: boolean) => void;
    onChildrenLoaded?: (id: string, children: LogNode[]) => void;
}

export const LogTree: React.FC<LogTreeProps> = React.memo(({
    node,
    depth = 0,
    initiallyOpen,
    dbPath,
    parentType,
    isFlatRow,
    isExpanded,
    onToggleExpand,
    onChildrenLoaded
}) => {
    const { t, i18n } = useTranslation();
    const failureMessage = (node as TestNode).failureDetail?.message || '';
    const isFatalError = (node as any).status === 'FAIL' && failureMessage.includes('Test execution stopped due to a fatal error.');

    // Override status locally for display and expansion logic
    const computedStatus = isFatalError ? 'NOT_RUN' : (node as any).status;

    const [internalIsOpen, setInternalIsOpen] = useState(initiallyOpen ?? (
        node.type !== 'text' && node.type !== 'suite-start' && computedStatus !== 'PASS' && computedStatus !== 'NOT_RUN'
    ));
    const isOpen = isFlatRow ? !!isExpanded : internalIsOpen;
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [screenshotData, setScreenshotData] = useState<string | null>(null);
    const [failureScreenshotData, setFailureScreenshotData] = useState<string | null>(null);

    // Lazy load state
    const [lazyChildren, setLazyChildren] = useState<LogNode[] | null>(null);
    const [isLoadingChildren, setIsLoadingChildren] = useState(false);

    // AI Analysis State
    const { settings } = useSettings();
    const [aiAnalysis, setAiAnalysis] = useState<string | null>((node as any).aiAnalysis || null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showAiAnalysis, setShowAiAnalysis] = useState(!!(node as any).aiAnalysis);

    const isRunning = computedStatus === 'RUNNING';
    const isFailed = computedStatus === 'FAIL';
    const isNotRun = computedStatus === 'NOT_RUN' || computedStatus === 'SKIP';

    const isInterrupted = computedStatus === 'FAIL' && failureMessage.includes('Execution terminated by signal');

    const hasChildrenArray = (node as any).children && (node as any).children.length > 0;
    const hasLazyChildren = lazyChildren && lazyChildren.length > 0;
    const hasMetadata = !!((node as any).doc || (node as any).ret || (node as any).aiAnalysis);
    const hasFailure = node.type === 'test' && !!(node as TestNode).failureDetail;
    const hasLogs = node.type === 'test' && (node as TestNode).logs && (node as TestNode).logs.length > 0;
    const hasScreenshot = (node.type === 'keyword' && !!(node as KeywordNode).screenshotPath) || 
                          (node.type === 'test' && !!(node as TestNode).failureDetail?.screenshotPath);

    // A node can be expanded if it has any children, lazy-load flag, documentation, return values, logs, failure details or screenshots
    const canExpand = (node as any).hasChildren || hasChildrenArray || hasLazyChildren || hasMetadata || hasFailure || hasLogs || hasScreenshot;

    const toggleOpen = () => {
        if (!canExpand) return;
        if (isFlatRow) {
            onToggleExpand?.(node.id, !isExpanded);
        } else {
            setInternalIsOpen(!isOpen);
        }
    };

    // Track previous status to only auto-expand on transitions. 
    // Initialized to undefined to allow the first status check to trigger auto-expansion on mount.
    const prevStatusRef = React.useRef<string | undefined>(undefined);

    // Auto-expand when status changes from PASS/NOT_RUN/undefined to RUNNING/FAIL
    React.useEffect(() => {
        const currentStatus = computedStatus;
        const prevStatus = prevStatusRef.current;

        // Only proceed if status is defined and actually changed OR it's the first check for a non-passing status
        if (currentStatus && currentStatus !== prevStatus) {
            const isFailingOrRunning = currentStatus !== 'PASS' && currentStatus !== 'NOT_RUN' && currentStatus !== 'SKIP';

            if (initiallyOpen === undefined && node.type !== 'text' && isFailingOrRunning) {
                if (isFlatRow) {
                    if (!isExpanded) onToggleExpand?.(node.id, true);
                } else {
                    setInternalIsOpen(true);
                }
            }
            prevStatusRef.current = currentStatus;
        }
    }, [node.id, computedStatus, initiallyOpen, node.type, isFlatRow, isExpanded, onToggleExpand]);

    // Fetch attempt reference to avoid dependency trigger loop cancellation
    const fetchAttempted = React.useRef(false);

    // Lazy loading core logic
    React.useEffect(() => {
        if (isOpen && dbPath && (node as any).hasChildren && (!(node as any).children || (node as any).children.length === 0) && !lazyChildren && !fetchAttempted.current) {
            let isMounted = true;
            fetchAttempted.current = true;
            setIsLoadingChildren(true);

            invoke<LogNode[]>('get_node_children', { dbPath, parentId: node.id })
                .then(children => {
                    if (isMounted) {
                        setLazyChildren(children);
                        onChildrenLoaded?.(node.id, children);
                    }
                })
                .catch(err => console.error("Failed to lazy load children for node", node.id, err))
                .finally(() => {
                    if (isMounted) setIsLoadingChildren(false);
                });
            return () => { isMounted = false; };
        }
    }, [isOpen, dbPath, node, lazyChildren]);

    // Lazy-load screenshots when expanded
    React.useEffect(() => {
        const fetchScreenshot = async (path: string, setter: (val: string) => void) => {
            console.log("[LogTree] Fetching screenshot:", path);
            if (path.startsWith("data:image")) {
                setter(path);
                return;
            }
            try {
                const b64 = await invoke<string>('read_image_base64', { path });
                const ext = path.split('.').pop()?.toLowerCase() || 'png';
                const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                    ext === 'gif' ? 'image/gif' :
                        ext === 'webp' ? 'image/webp' : 'image/png';
                const dataUrl = `data:${mime};base64,${b64}`;
                console.log("[LogTree] Screenshot loaded successfully:", path.substring(path.length - 20));
                setter(dataUrl);
            } catch (err) {
                console.error("[LogTree] Failed to lazy-load screenshot:", err, "Path:", path);
                setter(`ERROR: ${err} | Path: ${path}`);
            }
        };

        if (isOpen) {
            if (node.type === 'keyword' && (node as KeywordNode).screenshotPath && !screenshotData) {
                fetchScreenshot((node as KeywordNode).screenshotPath!, setScreenshotData);
            }
            if (node.type === 'test' && isFailed && (node as TestNode).failureDetail?.screenshotPath && !failureScreenshotData) {
                fetchScreenshot((node as TestNode).failureDetail!.screenshotPath!, setFailureScreenshotData);
            }
        }
    }, [isOpen, node, isFailed, screenshotData, failureScreenshotData]);

    if (node.type === 'text') {
        if (node.content.match(/^[-=]+$/)) return null;
        return <LinkRenderer key={node.id} content={node.content} />;
    }

    if (node.type === 'suite-start' || node.type === 'suite-end') return null;

    const subType = node.type === 'keyword' ? (node as KeywordNode).subType : undefined;

    const borderColor = isRunning ? "border-on-surface-variant/20" : isNotRun ? "border-on-surface-variant/10" : (isInterrupted ? "border-amber-500/30" : (isFailed ? "border-error/20" : "border-success/20"));
    const summaryColor = isRunning ? "text-on-surface-variant/80" : isNotRun ? "text-on-surface-variant/40" : (isInterrupted ? "text-amber-500" : (isFailed ? "text-error" : "text-success"));
    const isDirectTestChild = parentType === 'test' && node.type === 'keyword';
    const isSuiteOrTest = node.type === 'suite' || node.type === 'test';
    const bgColor = isDirectTestChild
        ? (isRunning ? "bg-surface-variant/10" : isNotRun ? "bg-surface-variant/5" : (isInterrupted ? "bg-amber-500/5" : (isFailed ? "bg-error/5" : "bg-success/5")))
        : (isSuiteOrTest ? "bg-transparent" : "bg-transparent");

    const markerColor = isRunning ? "bg-on-surface-variant/20" : isNotRun ? "bg-on-surface-variant/10" : (isInterrupted ? "bg-amber-500/50" : (isFailed ? "bg-error/40" : "bg-success/40"));

    const nodeConfig: Record<string, { label: string; color: string }> = {
        suite: { label: t('run_tab.console.node_types.suite', 'SUITE'), color: 'text-primary/70' },
        test: { label: t('run_tab.console.node_types.test', 'TEST'), color: 'text-secondary/70' },
        keyword: { label: t('run_tab.console.node_types.keyword', 'KW'), color: 'text-on-surface/40' },
        setup: { label: t('run_tab.console.node_types.setup', 'SETUP'), color: 'text-blue-400/80' },
        teardown: { label: t('run_tab.console.node_types.teardown', 'TEARDOWN'), color: 'text-purple-400/80' },
        for: { label: t('run_tab.console.node_types.for', 'FOR'), color: 'text-amber-400/80' },
        iteration: { label: t('run_tab.console.node_types.iteration', 'ITER'), color: 'text-amber-300/70' },
        if: { label: t('run_tab.console.node_types.if', 'IF'), color: 'text-cyan-400/80' },
        'else-if': { label: t('run_tab.console.node_types.else-if', 'ELSE IF'), color: 'text-cyan-300/70' },
        else: { label: t('run_tab.console.node_types.else', 'ELSE'), color: 'text-cyan-300/70' },
        try: { label: t('run_tab.console.node_types.try', 'TRY'), color: 'text-indigo-400/80' },
        except: { label: t('run_tab.console.node_types.except', 'EXCEPT'), color: 'text-rose-400/80' },
        finally: { label: t('run_tab.console.node_types.finally', 'FINALLY'), color: 'text-purple-400/80' },
        while: { label: t('run_tab.console.node_types.while', 'WHILE'), color: 'text-orange-400/80' },
        break: { label: t('run_tab.console.node_types.break', 'BREAK'), color: 'text-rose-300/70' },
        continue: { label: t('run_tab.console.node_types.continue', 'CONTINUE'), color: 'text-rose-300/70' },
    };

    const nodeKey = node.type === 'suite' ? 'suite' : node.type === 'test' ? 'test' : (subType as string || 'keyword');
    const { label: pill, color: pillColor } = nodeConfig[nodeKey] ?? nodeConfig['keyword'];

    return (
        <div
            id={`log-node-${node.id}`}
            className={clsx(
                "flex flex-col transition-all overflow-hidden border",
                "mb-2 rounded-xl",
                borderColor,
                bgColor
            )}
        >
            <div
                className={clsx(
                    "flex items-center gap-2 p-2 min-w-0 relative",
                    canExpand ? "cursor-pointer hover:bg-on-surface/5" : "cursor-default",
                    !isFlatRow && "rounded-t-xl",
                    isFlatRow && depth === 0 && "rounded-t-xl",
                    (node.type === 'suite' || node.type === 'test') && "pl-4"
                )}
                onClick={toggleOpen}
            >
                {(node.type === 'suite' || node.type === 'test') && (
                    <div className={clsx(
                        "absolute left-0 top-0 bottom-0 w-1 rounded",
                        markerColor
                    )} />
                )}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {canExpand ? (
                        isOpen ? <ChevronDown size={14} className="text-on-surface-variant/80 shrink-0" /> : <ChevronRight size={14} className="text-on-surface-variant/80 shrink-0" />
                    ) : (
                        <div className="w-[14px] h-[14px] shrink-0" /> // Spacer for alignment
                    )}

                    {node.type === 'suite' && <Layers size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'test' && <BugPlay size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'keyword' && <CirclePlay size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'for' && <Repeat size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'iteration' && <IterationCcw size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'if' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'else-if' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'else' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'try' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'except' && <ShieldAlert size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'finally' && <Anchor size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'while' && <Infinity size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'break' && <Split size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'continue' && <StepForward size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'setup' && <CalendarCog size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'teardown' && <CalendarCog size={14} className="opacity-70 shrink-0" />}

                    <span
                        className={clsx(
                            "truncate",
                            node.type === 'suite' ? "font-bold text-sm" : "text-xs font-medium",
                            isRunning ? "text-on-surface-variant/80" : isNotRun ? "text-on-surface-variant/50" : (isInterrupted ? "text-amber-500" : (isFailed ? "text-error" : "text-success"))
                        )}
                        title={node.name}
                    >
                        <span className={clsx("text-[9px] mr-1.5 uppercase font-bold tracking-tighter", pillColor)}>{pill}</span>
                        {(() => {
                            const name = node.name;
                            const base = name.replace(/\.+$/, '');
                            const dots = name.substring(base.length);
                            return base.includes('.') ? base.split('.').pop() + dots : name;
                        })()}

                        {node.type === 'keyword' && (node as KeywordNode).args && (node as KeywordNode).args!.length > 0 && (
                            <span className="ml-2 opacity-50 font-normal italic overflow-hidden text-ellipsis">
                                {((node as KeywordNode).args || [])
                                    .filter(arg => arg !== node.name && arg !== pill)
                                    .join(', ')}
                            </span>
                        )}
                    </span>
                </div>
                <div className={clsx(
                    "text-[12px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0",
                    bgColor, summaryColor
                )}>
                    {(node.duration || (node.type === 'suite' && (node as SuiteNode).stats)) && (
                        <span className="px-2 font-mono opacity-80 text-on-surface-variant border-none flex items-center gap-2">
                            {node.type === 'suite' && (node as SuiteNode).stats && (
                                <span className="flex items-center gap-1 mr-2 border-r border-on-surface/10 pr-2 shrink-0 opacity-80">
                                    <span className="text-success">{(node as SuiteNode).stats?.passed}P</span>
                                    <span className="text-on-surface-variant/30">|</span>
                                    <span className="text-error">{(node as SuiteNode).stats?.failed}F</span>
                                    <span className="text-on-surface-variant/30">|</span>
                                    <span className="text-on-surface-variant/40">{(node as SuiteNode).stats?.skipped}S</span>
                                </span>
                            )}
                            {node.duration}
                        </span>
                    )}
                    {isRunning
                        ? <ExpressiveLoading size="xsm" variant="circular" />
                        : (computedStatus === 'SKIP')
                            ? <MinusCircle size={10} className="text-on-surface-variant/40" />
                            : isNotRun
                                ? <MinusCircle size={10} />
                                : isInterrupted
                                    ? <CircleSlash size={10} />
                                    : isFailed
                                        ? <XCircle size={10} />
                                        : <CheckCircle2 size={10} />}
                    {isRunning
                        ? t('run_tab.console.running')
                        : (computedStatus === 'SKIP')
                            ? t('run_tab.console.skip', 'SKIPPED')
                            : isNotRun
                                ? t('run_tab.console.not_run')
                                : isInterrupted
                                    ? t('run_tab.console.interrupted')
                                    : isFailed
                                        ? t('run_tab.console.fail')
                                        : t('run_tab.console.pass')}
                </div>
            </div>

            {isOpen && (
                <div className={clsx(
                    "flex flex-col gap-1 p-2 pl-4 border-t border-on-surface/5",
                    isFlatRow && "bg-on-surface/[0.02]"
                )}>
                    {/* Documentation Section */}
                    {(node as any).doc && (
                        <div className="mb-2 p-2.5 bg-on-surface/[0.03] border border-on-surface/5 rounded-lg text-[11px] animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center gap-1.5 opacity-40 font-bold uppercase tracking-wider mb-1">
                                <Info size={10} />
                                {t('run_tab.console.documentation', 'Documentation')}
                            </div>
                            <div className="text-on-surface-variant/80 italic whitespace-pre-wrap leading-relaxed font-medium">
                                {(node as any).doc}
                            </div>
                        </div>
                    )}

                    {/* Return Value Section */}
                    {(node.type === 'keyword' || node.type === 'test') && (node as any).ret && (
                        <div className="mb-2 p-2.5 bg-success/5 border border-success/10 rounded-lg text-[11px] animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center gap-1.5 text-success/60 font-bold uppercase tracking-wider mb-1">
                                <CornerDownRight size={10} />
                                {t('run_tab.console.return_value', 'Return Value')}
                            </div>
                            <div className="font-mono text-success/90 break-all bg-success/10 p-1.5 rounded border border-success/5">
                                {(node as KeywordNode).ret}
                            </div>
                        </div>
                    )}
                    {node.type === 'test' && (isFailed || isFatalError) && (node as TestNode).failureDetail && (
                        <div className={clsx(
                            "mb-2 p-2 border rounded-xl text-xs animate-in fade-in slide-in-from-top-1 flex flex-col gap-4",
                            isInterrupted ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-error/10 border-error/20 text-error"
                        )}>
                            <div className="flex justify-between gap-4 items-start w-full">
                                <div className="flex flex-col gap-1 min-w-0 w-full">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-bold uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                                            {isInterrupted ? <Hand size={12} /> : <XCircle size={12} />}
                                            {isInterrupted ? t('run_tab.console.interrupted') : t('run_tab.console.failure_detail')}
                                        </div>
                                        {!isInterrupted && (
                                            <AiButton
                                                id="log_analysis"
                                                isLoading={isAnalyzing}
                                                onClick={async (e, customPrompt) => {
                                                    e.stopPropagation();
                                                    setIsAnalyzing(true);
                                                    setShowAiAnalysis(true);
                                                    setAiAnalysis(null);

                                                    const langName = i18n.language === 'pt' ? 'Portuguese' : i18n.language === 'es' ? 'Spanish' : 'English';
                                                    const systemInstruction = getFailureAnalysisPrompt(langName, customPrompt);

                                                    const prompt = `
Test Name: ${node.name}
Error Message: ${(node as TestNode).failureDetail?.message}
`.trim();

                                                    try {
                                                        setAiError(null);
                                                        let result = "";
                                                        const provider = settings.aiProvider;
                                                        const screenshot = failureScreenshotData && !failureScreenshotData.startsWith("ERROR") ? failureScreenshotData : undefined;

                                                        if (provider === 'gemini') {
                                                            result = await askGemini(prompt, settings.geminiApiKey || '', settings.geminiModel, systemInstruction, screenshot);
                                                        } else if (provider === 'claude') {
                                                            result = await askClaude(prompt, settings.claudeApiKey || '', settings.claudeModel, systemInstruction, screenshot);
                                                        } else if (provider === 'openai') {
                                                            result = await askOpenAI(prompt, settings.openaiApiKey || '', settings.openaiModel, systemInstruction, screenshot);
                                                        } else if (provider === 'claude-code') {
                                                            const path = node.type === 'test' 
                                                                ? (node as TestNode).failureDetail?.screenshotPath 
                                                                : (node as any).screenshotPath;
                                                            result = await askClaudeCode(prompt, settings.paths.automationRoot || '', systemInstruction, settings.claudeCodeToken, path);
                                                        } else {
                                                            throw new Error("No AI provider configured");
                                                        }
                                                        setAiAnalysis(result);

                                                        if (dbPath) {
                                                            invoke('save_node_ai_analysis', {
                                                                dbPath,
                                                                nodeId: node.id,
                                                                analysis: result
                                                            }).catch(err => console.error("Failed to persist node AI analysis:", err));
                                                        }
                                                    } catch (err: any) {
                                                        console.error("AI Analysis Error:", err);
                                                        setAiError(err.message || String(err));
                                                        feedback.toast.error(t('run_tab.console.ai_error_generic'));
                                                    } finally {
                                                        setIsAnalyzing(false);
                                                    }
                                                }}
                                                label={t('run_tab.console.analyze_failure')}
                                                title={t('run_tab.console.analyze_failure')}
                                                variant="ghost"
                                                expandable={true}
                                                showTextAlways={false}
                                                className="h-8 p-1 px-2 border-error/20 bg-error/5 text-error hover:bg-error/20 shadow-sm"
                                            />
                                        )}
                                    </div>
                                    <div className="font-mono whitespace-pre-wrap leading-relaxed">{(node as TestNode).failureDetail!.message}</div>
                                </div>
                                {(node as TestNode).failureDetail!.screenshotPath && (
                                    <div
                                        className="shrink-0 group relative cursor-zoom-in overflow-hidden self-start rounded-lg border border-error/20 shadow-sm min-w-[100px] min-h-[60px] bg-black/5 flex items-center justify-center"
                                        onClick={(e) => { e.stopPropagation(); if (failureScreenshotData) setPreviewImage(failureScreenshotData); }}
                                    >
                                        {failureScreenshotData ? (
                                            failureScreenshotData.startsWith("ERROR") ? (
                                                <div className="flex flex-col items-center gap-2 px-4 py-2 text-error text-xs text-center max-w-[250px]">
                                                    <XCircle size={20} className="text-error" />
                                                    <span className="break-all">{failureScreenshotData.replace("ERROR: ", "")}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <img
                                                        src={failureScreenshotData}
                                                        alt={t('run_tab.console.failure_screenshot')}
                                                        className="h-28 object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 flex items-center justify-center">
                                                        <div className="opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 bg-black/60 text-white p-2.5 rounded-full shadow-lg backdrop-blur-sm">
                                                            <Maximize2 size={16} />
                                                        </div>
                                                    </div>
                                                </>
                                            )
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 px-4 py-2 opacity-50">
                                                <ExpressiveLoading size="sm" variant="circular" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {showAiAnalysis && (
                                <AiResponse
                                    title={t('run_tab.console.ai_insight')}
                                    isLoading={isAnalyzing}
                                    rationale={aiAnalysis}
                                    rationaleHeader={t('run_tab.console.ai_analysis_header')}
                                    error={aiError}
                                    className="animate-in fade-in slide-in-from-top-1"
                                    onCopy={(text) => {
                                        navigator.clipboard.writeText(text);
                                        feedback.toast.success(t('common.copied'));
                                    }}
                                />
                            )}
                        </div>
                    )}


                    {node.type === 'keyword' && (node as KeywordNode).screenshotPath && (
                        <div className="mb-2 p-3 text-on-surface-variant text-xs animate-in fade-in slide-in-from-top-1 flex justify-between gap-2">
                            <div className="font-bold mb-1 uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                                <BugPlay size={12} />
                                {t('run_tab.console.step_screenshot')}
                            </div>
                            <div
                                className="group relative cursor-zoom-in overflow-hidden rounded-lg min-w-[100px] min-h-[60px] bg-black/5 flex items-center justify-center"
                                onClick={(e) => { e.stopPropagation(); if (screenshotData) setPreviewImage(screenshotData); }}
                            >
                                {screenshotData ? (
                                    screenshotData.startsWith("ERROR") ? (
                                        <div className="flex flex-col items-center gap-2 px-4 py-2 text-error text-xs text-center max-w-[250px]">
                                            <XCircle size={20} className="text-error" />
                                            <span className="break-all">{screenshotData.replace("ERROR: ", "")}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <img
                                                src={screenshotData}
                                                alt={t('run_tab.console.keyword_screenshot')}
                                                className="h-28 object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/0 flex items-center justify-center">
                                                <div className="opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 bg-black/60 text-white p-2.5 rounded-full shadow-lg backdrop-blur-sm">
                                                    <Maximize2 size={18} />
                                                </div>
                                            </div>
                                        </>
                                    )
                                ) : (
                                    <div className="flex flex-col items-center gap-2 px-4 py-2 opacity-50">
                                        <ExpressiveLoading size="sm" variant="circular" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {node.type === 'test' && (node as TestNode).logs && (node as TestNode).logs.map((log, i) => (
                        <LinkRenderer key={`log-${i}-${node.id}`} content={log} />
                    ))}

                    {!isFlatRow && (
                        <div className="flex flex-col space-y-2">
                            {((node as any).children && !lazyChildren) && (node as any).children.map((child: LogNode) => (
                                <LogTree key={child.id} node={child} depth={depth + 1} dbPath={dbPath} parentType={node.type} onChildrenLoaded={onChildrenLoaded} />
                            ))}
                            {lazyChildren && lazyChildren.map((child: LogNode) => (
                                <LogTree key={child.id} node={child} depth={depth + 1} dbPath={dbPath} parentType={node.type} onChildrenLoaded={onChildrenLoaded} />
                            ))}
                        </div>
                    )}
                    {isLoadingChildren && (
                        <div className="flex items-center gap-2 p-3 text-xs opacity-60 ml-4 font-mono text-on-surface-variant">
                            <ExpressiveLoading size="xsm" variant="circular" />
                            {t('run_tab.console.loading_children')}
                        </div>
                    )}
                </div>
            )}

            {/* Fullscreen Preview Portal */}
            {previewImage && createPortal(
                <AnimatePresence>
                    <div
                        className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out"
                        onClick={() => setPreviewImage(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative max-w-full max-h-full flex flex-col items-center gap-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={previewImage}
                                alt="Full size preview"
                                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl border border-white/10"
                            />
                            <div className="flex items-center gap-4">
                                <button
                                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all font-medium border border-white/10 flex items-center gap-2 group"
                                    onClick={() => setPreviewImage(null)}
                                >
                                    <XCircle size={18} className="text-white/70 group-hover:text-white transition-colors" />
                                    {t('common.close')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
});
