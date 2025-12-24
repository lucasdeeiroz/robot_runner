import { useEffect, useRef, useState, useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, CheckCircle2, XCircle } from "lucide-react";

interface RunConsoleProps {
    logs: string[];
    isRunning?: boolean;
}

type LogNode =
    | { type: 'text'; content: string }
    | { type: 'test-group'; name: string; status: 'PASS' | 'FAIL'; logs: string[]; id: string };

export function RunConsole({ logs, isRunning }: RunConsoleProps) {
    const { t } = useTranslation();
    const bottomRef = useRef<HTMLDivElement>(null);

    // State for toggles
    // For PASS: Default collapsed, user adds to this set to expand.
    const [expandedPassIds, setExpandedPassIds] = useState<Set<string>>(new Set());
    // For FAIL: Default expanded, user adds to this set to collapse.
    const [collapsedFailIds, setCollapsedFailIds] = useState<Set<string>>(new Set());

    // Auto-scroll on new logs
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    // Parse logs into nodes
    const nodes = useMemo(() => {
        const parsed: LogNode[] = [];
        let buffer: string[] = [];
        let activeFailGroupId: string | null = null; // Track if we are capturing error details after a FAIL

        // Regex helpers
        const isSeparator = (line: string) => /^[-=]{10,}$/.test(line.trim());
        const getStatusLine = (line: string) => {
            // Escaped pipes are critical! Matches: "Test Name | PASS |" or just "| PASS |"
            const match = line.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);
            if (match) {
                return { namePrefix: match[1].trim(), status: match[2] as 'PASS' | 'FAIL' };
            }
            return null;
        };

        const flushBufferAsText = () => {
            if (buffer.length > 0) {
                buffer.forEach(line => parsed.push({ type: 'text', content: line }));
                buffer = [];
            }
        };

        logs.forEach((log) => {
            const separator = isSeparator(log);
            const statusInfo = getStatusLine(log);

            if (separator) {
                // Separator marks the definitive end of any current flow
                if (activeFailGroupId) {
                    activeFailGroupId = null;
                }
                flushBufferAsText();
                parsed.push({ type: 'text', content: log });
                return;
            }

            if (activeFailGroupId) {
                // We are in the "Error Message" phase after a FAIL line but before the next separator
                const groupIndex = parsed.findIndex(node => node.type === 'test-group' && node.id === activeFailGroupId);
                if (groupIndex !== -1) {
                    (parsed[groupIndex] as any).logs.push(log);
                } else {
                    parsed.push({ type: 'text', content: log });
                }
                return;
            }

            if (statusInfo) {
                // Found a status line (END of a test block)
                const { status } = statusInfo;

                // Determine Test Name:
                // If buffer is NOT empty, first line is Name.
                // If buffer IS empty, and namePrefix is present, it's likely a Suite Summary line.

                if (buffer.length > 0) {
                    const testName = buffer[0];
                    const logsBody = buffer.slice(1); // Remove name from body

                    // Stabilize ID by using index instead of Date.now()
                    // This ensures state (expanded/collapsed) persists across re-renders
                    const id = `test-${parsed.length}`;

                    // Add the status line itself to body for completeness
                    logsBody.push(log);

                    parsed.push({
                        type: 'test-group',
                        name: testName,
                        status,
                        logs: logsBody,
                        id
                    });

                    if (status === 'FAIL') {
                        activeFailGroupId = id;
                    }
                } else {
                    // Buffer empty = Suite Summary line (Name | STATUS |)
                    // Render as plain text
                    parsed.push({ type: 'text', content: log });
                }

                buffer = [];
                return;
            }

            // Normal line
            buffer.push(log);
        });

        // Flush remaining
        flushBufferAsText();

        return parsed;
    }, [logs]);

    // Toggle logic
    const toggleGroup = (id: string, status: 'PASS' | 'FAIL') => {
        if (status === 'PASS') {
            setExpandedPassIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        } else {
            setCollapsedFailIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); // If collapsed, remove to expand
                else next.add(id); // If expanded, add to collapse
                return next;
            });
        }
    };

    const openLink = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            console.error("Failed to open link", e);
        }
    };

    const renderLogLine = (log: string, i: number) => {
        const linkMatch = log.match(/^(Output|Log|Report):\s+(.*)$/);
        if (linkMatch) {
            const label = linkMatch[1];
            const path = linkMatch[2].trim();
            return (
                <div key={i} className="mb-0.5 pl-4">
                    <span className="text-zinc-500">{label}: </span>
                    <span
                        onClick={() => openLink(path)}
                        className="text-blue-400 hover:text-blue-300 cursor-pointer hover:underline"
                        title="Open File"
                    >
                        {path}
                    </span>
                </div>
            );
        }

        return (
            <div key={i} className={clsx(
                "whitespace-pre-wrap break-all leading-tight mb-0.5",
                log.includes("[Error]") || log.includes("STDERR") ? "text-red-400" :
                    log.includes("[System]") ? "text-blue-400 font-semibold" :
                        "text-zinc-300"
            )}>
                {log}
            </div>
        );
    };

    return (
        <div className="h-full bg-black/90 rounded-lg p-4 font-mono text-sm overflow-auto border border-zinc-800 shadow-inner custom-scrollbar">
            {logs.length === 0 && (
                <div className="text-zinc-500 italic opacity-50 select-none">{t('console.waiting')}</div>
            )}

            {nodes.map((node, idx) => {
                if (node.type === 'text') {
                    // Render separators clearer? 
                    if (node.content.match(/^[-=]+$/)) {
                        return <div key={idx} className="text-zinc-600 select-none opacity-50 text-[10px]">{node.content}</div>;
                    }
                    return renderLogLine(node.content, idx);
                } else {
                    // Logic: PASS is expanded ONLY if in expandedPassIds. FAIL is expanded UNLESS in collapsedFailIds.
                    const isExpanded = node.status === 'PASS'
                        ? expandedPassIds.has(node.id)
                        : !collapsedFailIds.has(node.id);

                    return (
                        <div key={idx} className="mb-2 mt-1 border border-zinc-800 bg-zinc-900/30 rounded-lg overflow-hidden">
                            {/* Header */}
                            <button
                                onClick={() => toggleGroup(node.id, node.status)}
                                className={clsx(
                                    "w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800/50 transition-colors text-left",
                                    node.status === 'PASS' ? "border-l-2 border-green-500" : "border-l-2 border-red-500"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                                    <span className={clsx("font-semibold truncated", node.status === 'PASS' ? "text-zinc-200" : "text-red-300")}>
                                        {node.name}
                                    </span>
                                </div>
                                <div className={clsx(
                                    "text-[10px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1",
                                    node.status === 'PASS' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-400"
                                )}>
                                    {node.status === 'PASS' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                    {node.status}
                                </div>
                            </button>

                            {/* Body */}
                            {isExpanded && (
                                <div className="p-2 pl-6 bg-black/20 text-xs border-t border-zinc-800/50">
                                    {node.logs.length === 0 ? (
                                        <span className="text-zinc-600 italic">No output</span>
                                    ) : (
                                        node.logs.map((line, i) => renderLogLine(line, i))
                                    )}
                                </div>
                            )}
                        </div>
                    );
                }
            })}

            {isRunning && (
                <div className="animate-pulse text-blue-500 mt-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    Processing...
                </div>
            )}
            <div ref={bottomRef} />
        </div>
    );
}
