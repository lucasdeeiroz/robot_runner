import React, { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronRight, ChevronDown, CheckCircle2, XCircle, MinusCircle,
    Layers, BugPlay, CirclePlay, Repeat, IterationCcw, Workflow,
    Infinity, Split, StepForward, CalendarCog, Maximize2
} from "lucide-react";
import { LogNode, TestNode, KeywordNode } from "@/lib/robotParser";
import { LinkRenderer } from "../molecules/LinkRenderer";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface LogTreeProps {
    node: LogNode;
    depth?: number;
    initiallyOpen?: boolean;
}

export const LogTree: React.FC<LogTreeProps> = ({ node, depth = 0, initiallyOpen }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(initiallyOpen ?? (
        node.type !== 'text' && node.type !== 'suite-start' && (node as any).status !== 'PASS' && (node as any).status !== 'NOT_RUN'
    ));
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Auto-expand when status changes from PASS/NOT_RUN/undefined to RUNNING/FAIL
    React.useEffect(() => {
        if (initiallyOpen === undefined && node.type !== 'text' && (node as any).status && (node as any).status !== 'PASS' && (node as any).status !== 'NOT_RUN') {
            setIsOpen(true);
        }
    }, [(node as any).status, initiallyOpen, node.type]);

    if (node.type === 'text') {
        if (node.content.match(/^[-=]+$/)) return null;
        return <LinkRenderer key={node.id} content={node.content} />;
    }

    if (node.type === 'suite-start' || node.type === 'suite-end') return null;

    const isRunning = (node as any).status === 'RUNNING';
    const isFailed = (node as any).status === 'FAIL';
    const isNotRun = (node as any).status === 'NOT_RUN';

    const subType = node.type === 'keyword' ? (node as KeywordNode).subType : undefined;

    const borderColor = isRunning ? "border-on-surface-variant/20" : isNotRun ? "border-on-surface-variant/10" : (isFailed ? "border-error/20" : "border-success/20");
    const summaryColor = isRunning ? "text-on-surface-variant/80" : isNotRun ? "text-on-surface-variant/40" : (isFailed ? "text-error" : "text-success");
    const bgColor = (node.type === 'suite' || node.type === 'test')
        ? "bg-transparent"
        : (isRunning ? "bg-surface-variant/10" : isNotRun ? "bg-surface-variant/5" : (isFailed ? "bg-error/5" : "bg-success/5"));

    const nodeConfig: Record<string, { label: string; color: string }> = {
        suite: { label: 'SUITE', color: 'text-primary/70' },
        test: { label: 'TEST', color: 'text-secondary/70' },
        keyword: { label: 'KW', color: 'text-on-surface/40' },
        setup: { label: 'SETUP', color: 'text-blue-400/80' },
        teardown: { label: 'TEARDOWN', color: 'text-purple-400/80' },
        for: { label: 'FOR', color: 'text-amber-400/80' },
        iteration: { label: 'ITER', color: 'text-amber-300/70' },
        if: { label: 'IF', color: 'text-cyan-400/80' },
        'else-if': { label: 'ELSE IF', color: 'text-cyan-300/70' },
        else: { label: 'ELSE', color: 'text-cyan-300/70' },
        while: { label: 'WHILE', color: 'text-orange-400/80' },
        break: { label: 'BREAK', color: 'text-rose-300/70' },
        continue: { label: 'CONTINUE', color: 'text-rose-300/70' },
    };

    const nodeKey = node.type === 'suite' ? 'suite' : node.type === 'test' ? 'test' : (subType as string || 'keyword');
    const { label: pill, color: pillColor } = nodeConfig[nodeKey] ?? nodeConfig['keyword'];

    return (
        <div key={node.id} className={clsx("flex flex-col mb-1.5 rounded-xl border transition-all overflow-hidden", borderColor, bgColor)}>
            <div
                className={clsx(
                    "flex items-center gap-2 p-2 cursor-pointer hover:bg-on-surface/5 rounded-t-xl min-w-0 relative",
                    (node.type === 'suite' || node.type === 'test') && "pl-4"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                {(node.type === 'suite' || node.type === 'test') && (
                    <div className={clsx(
                        "absolute left-0 top-0 bottom-0 w-1 rounded",
                        isFailed ? "bg-error/40" : "bg-success/40"
                    )} />
                )}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isOpen ? <ChevronDown size={14} className="text-on-surface-variant/80 shrink-0" /> : <ChevronRight size={14} className="text-on-surface-variant/80 shrink-0" />}

                    {node.type === 'suite' && <Layers size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'test' && <BugPlay size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'keyword' && <CirclePlay size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'for' && <Repeat size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'iteration' && <IterationCcw size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'if' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'else-if' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'else' && <Workflow size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'while' && <Infinity size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'break' && <Split size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'continue' && <StepForward size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'setup' && <CalendarCog size={14} className="opacity-70 shrink-0" />}
                    {node.type === 'keyword' && subType === 'teardown' && <CalendarCog size={14} className="opacity-70 shrink-0" />}

                    <span className={clsx(
                        "truncate",
                        node.type === 'suite' ? "font-bold text-sm" : "text-xs font-medium",
                        isRunning ? "text-on-surface-variant/80" : isNotRun ? "text-on-surface-variant/50" : (isFailed ? "text-error" : "text-success")
                    )}>
                        <span className={clsx("text-[9px] mr-1.5 uppercase font-bold tracking-tighter", pillColor)}>{pill}</span>
                        {node.name}

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
                    "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0",
                    bgColor, summaryColor
                )}>
                    {node.duration && (
                        <span className="px-2 font-mono opacity-80 text-on-surface-variant border-none">
                            {node.duration}
                        </span>
                    )}
                    {isRunning
                        ? <ExpressiveLoading size="xsm" variant="circular" />
                        : isNotRun
                            ? <MinusCircle size={10} />
                            : isFailed
                                ? <XCircle size={10} />
                                : <CheckCircle2 size={10} />}
                    {isRunning
                        ? t('run_tab.console.running')
                        : isNotRun
                            ? t('run_tab.console.not_run')
                            : isFailed
                                ? t('run_tab.console.fail')
                                : t('run_tab.console.pass')}
                </div>
            </div>

            {isOpen && (
                <div className="flex flex-col gap-1 p-2 pl-4 border-t border-on-surface/5">
                    {node.type === 'test' && (node as TestNode).failureDetail && (
                        <div className="mb-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs animate-in fade-in slide-in-from-top-1 flex justify-between gap-4 items-center">
                            <div className="flex flex-col gap-1 min-w-0">
                                <div className="font-bold uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                                    <XCircle size={12} />
                                    {t('run_tab.console.failure_detail')}
                                </div>
                                <div className="font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-40">{(node as TestNode).failureDetail!.message}</div>
                            </div>
                            {(node as TestNode).failureDetail!.screenshot && (
                                <div
                                    className="shrink-0 group relative cursor-zoom-in overflow-hidden self-start rounded-lg border border-error/20 shadow-sm"
                                    onClick={(e) => { e.stopPropagation(); setPreviewImage((node as TestNode).failureDetail!.screenshot!); }}
                                >
                                    <img
                                        src={(node as TestNode).failureDetail!.screenshot}
                                        alt={t('run_tab.console.failure_screenshot')}
                                        className="h-28 object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 flex items-center justify-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 bg-black/60 text-white p-2.5 rounded-full shadow-lg backdrop-blur-sm">
                                            <Maximize2 size={16} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {node.type === 'keyword' && (node as KeywordNode).screenshot && (
                        <div className="mb-2 p-3 text-on-surface-variant text-xs animate-in fade-in slide-in-from-top-1 flex justify-between gap-2">
                            <div className="font-bold mb-1 uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                                <BugPlay size={12} />
                                {t('run_tab.console.step_screenshot')}
                            </div>
                            <div
                                className="group relative cursor-zoom-in overflow-hidden rounded-lg"
                                onClick={(e) => { e.stopPropagation(); setPreviewImage((node as KeywordNode).screenshot!); }}
                            >
                                <img
                                    src={(node as KeywordNode).screenshot}
                                    alt={t('run_tab.console.keyword_screenshot')}
                                    className="h-28 object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 bg-black/60 text-white p-2.5 rounded-full shadow-lg backdrop-blur-sm">
                                        <Maximize2 size={18} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {node.children && node.children.map((child: LogNode) => (
                        <LogTree key={child.id} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}

            {/* Fullscreen Preview Portal */}
            {previewImage && createPortal(
                <AnimatePresence>
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out"
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
                                    {t('common.close') || 'Close'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};
