import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Layers, Loader2 } from "lucide-react";

interface RunConsoleProps {
    logs: string[];
    isRunning?: boolean;
}



interface TextNode {
    type: 'text';
    content: string;
    id: string;
}

interface SuiteStartNode {
    type: 'suite-start';
    name: string;
    originalLine: string;
    id: string;
}

interface TestNode {
    type: 'test';
    name: string;
    documentation?: string;
    status: 'PASS' | 'FAIL';
    logs: string[];
    id: string;
}

interface SuiteEndNode {
    type: 'suite-end';
    name: string;
    documentation?: string;
    status: 'PASS' | 'FAIL';
    summary: string;
    id: string;
}

interface SuiteNode {
    type: 'suite';
    id: string;
    name: string;
    documentation?: string;
    status: 'PASS' | 'FAIL';
    summary: string;
    children: LogNode[];
}

type LogNode = TextNode | SuiteStartNode | TestNode | SuiteNode | SuiteEndNode;
type LinearNode = TextNode | SuiteStartNode | TestNode | SuiteEndNode;

const isSeparator = (line: string) => /^[-=]{10,}$/.test(line.trim());
const isSuiteHeader = (line: string) => /^.+\s+::\s+.+$/.test(line.trim());
const isArtifact = (line: string) => /^\s*(Output|Log|Report):/.test(line);

export function RunConsole({ logs, isRunning }: RunConsoleProps) {
    const { t } = useTranslation();


    // State for toggles (Set of IDs)
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new logs
    // Auto-scroll on new logs with stick-to-bottom logic
    useEffect(() => {
        const el = containerRef.current;
        if (!el || el.clientHeight === 0) return;

        // Tolerance for floating point sizes or small mismatches
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;

        if (isAtBottom || logs.length < 5) {
            el.scrollTop = el.scrollHeight;
        }
    }, [logs, isRunning]);

    // Incremental Parsing State
    const [tree, setTree] = useState<LogNode[]>([]);
    const [pendingLogs, setPendingLogs] = useState<string[]>([]);

    // Persistent Parsing Context (using Refs to survive renders without re-parsing old logs)
    const parsedNodesRef = useRef<LinearNode[]>([]);
    const processedCountRef = useRef<number>(0);
    const bufferRef = useRef<string[]>([]);
    const activeFailGroupIdRef = useRef<string | null>(null);

    // Reset state if logs are cleared or replaced entirely (e.g. re-run)
    useEffect(() => {
        if (logs.length < processedCountRef.current) {
            parsedNodesRef.current = [];
            processedCountRef.current = 0;
            bufferRef.current = [];
            activeFailGroupIdRef.current = null;
            setTree([]);
            setPendingLogs([]);
        }
    }, [logs.length]);

    // Parse incremental logs
    useEffect(() => {
        const currentCount = logs.length;
        const processedCount = processedCountRef.current;

        if (currentCount === processedCount) return;

        // Get only new lines
        const newLogs = logs.slice(processedCount);
        const linearNodes = parsedNodesRef.current;
        let buffer = bufferRef.current;
        let activeFailGroupId = activeFailGroupIdRef.current;

        const processBufferAsText = () => {
            if (buffer.length > 0) {
                buffer.forEach((line, idx) => {
                    if (isSuiteHeader(line)) {
                        linearNodes.push({
                            type: 'suite-start',
                            name: line.split(' :: ')[0].trim(),
                            originalLine: line,
                            id: `suite-start-${linearNodes.length}-${idx}`
                        });
                    } else {
                        linearNodes.push({ type: 'text', content: line, id: `txt-${linearNodes.length}-${idx}` });
                    }
                });
                buffer = [];
            }
        };

        let linesProcessed = 0;

        for (let i = 0; i < newLogs.length; i++) {
            const log = newLogs[i];

            // Detect specific "Noise" lines
            const separator = isSeparator(log);
            const isSystem = log.trim().startsWith('[System]');
            const isError = log.trim().startsWith('[Error]');
            const isArtifactLine = isArtifact(log);

            if (separator || isSystem || isError || isArtifactLine) {
                if (separator && activeFailGroupId) {
                    activeFailGroupId = null;
                }

                if (activeFailGroupId) {
                    if (separator) {
                        activeFailGroupId = null;
                        processBufferAsText();
                        linearNodes.push({ type: 'text', content: log, id: `sep-${processedCount + i}` });
                    } else {
                        if (isSystem || isError || isArtifactLine) {
                            activeFailGroupId = null;
                            processBufferAsText();
                            linearNodes.push({ type: 'text', content: log, id: `sys-${processedCount + i}` });
                        }
                    }
                    linesProcessed++;
                    continue;
                }

                processBufferAsText();
                linearNodes.push({ type: 'text', content: log, id: `sys-${processedCount + i}` });
                linesProcessed++;
                continue;
            }

            // Check for Status Line
            const statusMatch = log.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);

            if (statusMatch) {
                // IMPORTANT: Ambiguity Check
                // If this is the very last line we have, we cannot determine if it is a Test End or Suite End
                // because Suite End is followed by a summary line.
                // We must defer processing this line until we have the next line (next chunk).
                if ((processedCount + i + 1) >= logs.length) {
                    // Stop processing here.
                    // Do not increment linesProcessed.
                    // This line will be processed in the next effect run when logs.length increases.
                    break;
                }

                const fullPrefix = statusMatch[1].trim();
                const status = statusMatch[2] as 'PASS' | 'FAIL';

                let name = fullPrefix;
                let documentation: string | undefined = undefined;
                if (fullPrefix.includes(" :: ")) {
                    const parts = fullPrefix.split(" :: ");
                    name = parts[0].trim();
                    documentation = parts.slice(1).join(" :: ").trim();
                }

                const nextLine = logs[processedCount + i + 1];
                const summaryMatch = nextLine?.match(/^(\d+) tests?, (\d+) passed, (\d+) failed/);

                if (summaryMatch) {
                    // Suite End
                    if (activeFailGroupId) activeFailGroupId = null;
                    processBufferAsText();

                    linearNodes.push({
                        type: 'suite-end',
                        name: name,
                        documentation,
                        status,
                        summary: nextLine,
                        id: `suite-${linearNodes.length}`
                    });

                    // Consume next line (summary) as well
                    if (i + 1 < newLogs.length) {
                        i++;
                        linesProcessed++;
                    }
                } else {
                    // Test End
                    if (activeFailGroupId) activeFailGroupId = null;

                    let testName = name;
                    let logsStartIdx = 0;

                    // Try to find the Test Name line in buffer
                    let nameIdx = -1;
                    if (testName && testName.length > 0) {
                        // Strict search: buffer must include the captured name
                        // Prefer checking startsWith for better accuracy if possible
                        // But includes is safer for partial matches. Strict "StartsWith" is preferred for title lines.
                        nameIdx = buffer.findIndex(l => l.trim().startsWith(testName));
                        if (nameIdx === -1) {
                            nameIdx = buffer.findIndex(l => l.includes(testName));
                        }
                    }

                    if (nameIdx === -1) {
                        // Fallback: If status name is empty/generic, find first generic content.
                        // CRITICAL: Skip Suite Headers to avoid stealing them!
                        nameIdx = buffer.findIndex(l => l.trim().length > 0 && !l.startsWith('[System]') && !isSeparator(l) && !isSuiteHeader(l));
                    }

                    if (nameIdx !== -1) {
                        // CRITICAL: Flush any lines appearing BEFORE the test name.
                        if (nameIdx > 0) {
                            const preText = buffer.slice(0, nameIdx);
                            preText.forEach((l, idx) => {
                                if (isSuiteHeader(l)) {
                                    linearNodes.push({
                                        type: 'suite-start',
                                        name: l.split(' :: ')[0].trim(),
                                        originalLine: l,
                                        id: `pre-suite-${processedCount}-${i}-${idx}`
                                    });
                                } else {
                                    linearNodes.push({ type: 'text', content: l, id: `pre-${processedCount}-${i}-${idx}` });
                                }
                            });
                        }

                        const bufferLine = buffer[nameIdx].trim();
                        let bufferName = bufferLine;
                        let bufferDoc = undefined;

                        if (bufferLine.includes(" :: ")) {
                            const parts = bufferLine.split(" :: ");
                            bufferName = parts[0].trim();
                            bufferDoc = parts.slice(1).join(" :: ").trim();
                        }

                        // Update Name/Doc from buffer if helpful
                        // If we matched loosely or fell back to heuristic
                        if (!testName || bufferName.includes(testName) || testName.includes(bufferName)) {
                            testName = bufferName;
                            if (!documentation && bufferDoc) {
                                documentation = bufferDoc;
                            }
                        }
                        logsStartIdx = nameIdx + 1;
                    }

                    const testLogs = buffer.slice(logsStartIdx);
                    testLogs.push(log);

                    const id = `test-${linearNodes.length}`;

                    linearNodes.push({
                        type: 'test',
                        name: testName || 'Test', // Fallback for empty names
                        documentation,
                        status,
                        logs: testLogs,
                        id
                    });

                    if (status === 'FAIL') {
                        activeFailGroupId = id;
                    }

                    buffer = [];
                }
            } else {
                if (activeFailGroupId) {
                    const targetNode = linearNodes.find(n => n.id === activeFailGroupId);
                    if (targetNode && targetNode.type === 'test') {
                        targetNode.logs.push(log);
                    } else {
                        buffer.push(log);
                    }
                } else {
                    buffer.push(log);
                }
            }
            linesProcessed++;
        }
        // REMOVED: processBufferAsText(); - Persist buffer across chunks!

        // Save state
        parsedNodesRef.current = linearNodes;
        processedCountRef.current = processedCount + linesProcessed;
        bufferRef.current = buffer;
        activeFailGroupIdRef.current = activeFailGroupId;

        // Update pending logs for UI
        setPendingLogs([...buffer]);

        // Phase 2: Reduce to Tree (Always run on full linear set for correctness, but it's fast)
        const stack: LogNode[] = [];

        linearNodes.forEach(node => {
            if (node.type === 'suite-end') {
                const cleanName = node.name.replace(/\.\.\.$/, '').trim();
                const tempChildren: LogNode[] = [];

                while (stack.length > 0) {
                    const top = stack.pop()!;
                    tempChildren.unshift(top);

                    if (top.type === 'suite-start') {
                        // Accurate Match: Name must match exactly
                        if (top.name === cleanName) {
                            break;
                        }
                    }

                    if (top.type === 'text') {
                        // Fallback Match: Check text content if it wasn't caught as a suite-start
                        const content = top.content.trim();
                        const parts = content.split(' :: ');
                        const headerName = parts[0].trim();

                        if (headerName === cleanName) {
                            break;
                        }
                    }
                }

                const displayName = node.name.split('.').pop() || node.name;
                const suiteNode: SuiteNode = {
                    type: 'suite',
                    id: node.id,
                    name: displayName,
                    documentation: node.documentation,
                    status: node.status,
                    summary: node.summary,
                    children: tempChildren
                };
                stack.push(suiteNode);

            } else {
                if (node.type === 'test' || node.type === 'text' || node.type === 'suite-start') {
                    stack.push(node);
                }
            }
        });

        setTree(stack);

    }, [logs]);


    // Toggle logic
    const toggleNode = (id: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const openLink = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            console.error("Failed to open link", e);
        }
    };

    const LinkRenderer = ({ content }: { content: string }) => {
        const linkMatch = content.match(/^(Output|Log|Report):\s+(.*)$/);
        if (linkMatch) {
            const label = linkMatch[1];
            const path = linkMatch[2].trim();
            return (
                <div className="mb-0.5 pl-4">
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
            <div className={clsx(
                "whitespace-pre-wrap break-all leading-tight mb-0.5",
                content.includes("[Error]") || content.includes("STDERR") ? "text-red-400" :
                    content.includes("[System]") ? "text-blue-400 font-semibold" :
                        "text-zinc-300"
            )}>
                {content}
            </div>
        );
    };

    // Recursive Render
    const renderNode = (node: LogNode) => {
        if (node.type === 'suite-start') return null;

        if (node.type === 'text') {
            // Filter out Suite Headers from UI (but keep them in data for structure)
            if (isSuiteHeader(node.content)) return null;
            // Filter out separators for cleaner UI?
            if (node.content.match(/^[-=]+$/)) return null;
            // Also filter out standard Empty lines if desired, or keep spacing
            return <LinkRenderer key={node.id} content={node.content} />;
        }

        if (node.type === 'test') {
            // Tests: Default Collapsed if PASS, Expanded if FAIL
            const isFailed = node.status === 'FAIL';
            const isUserToggled = collapsedIds.has(node.id); // If in set, it is TOGGLED (inverted from default)

            const isOpen = isFailed ? !isUserToggled : isUserToggled;

            return (
                <div key={node.id} className="mb-2 mt-1 border border-zinc-800 bg-zinc-900/30 rounded-lg overflow-hidden">
                    <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                        className={clsx(
                            "w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800/50 transition-colors text-left relative z-10 cursor-pointer select-none",
                            isFailed ? "border-l-2 border-red-500" : "border-l-2 border-green-500"
                        )}
                    >
                        <div className="flex items-center gap-2 max-w-[80%]">
                            {isOpen ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
                            <span className={clsx("font-semibold truncate", isFailed ? "text-red-300" : "text-zinc-200")}>
                                {node.name}
                            </span>
                        </div>
                        <div className={clsx(
                            "text-[10px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0",
                            isFailed ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-500"
                        )}>
                            {isFailed ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                            {node.status}
                        </div>
                    </div>
                    {isOpen && (
                        <div className="p-2 pl-6 bg-black/20 text-xs border-t border-zinc-800/50">
                            {node.documentation && (
                                <div className="text-zinc-500 italic mb-2 border-b border-zinc-800 pb-1 text-xs">
                                    Documentation: {node.documentation}
                                </div>
                            )}
                            {node.logs.map((line, i) => <LinkRenderer key={i} content={line} />)}
                        </div>
                    )}
                </div>
            );
        }

        if (node.type === 'suite') {
            // Suites: Default Open
            const isToggled = collapsedIds.has(node.id);
            const isOpen = !isToggled;
            const isFailed = node.status === 'FAIL';

            return (
                <div key={node.id} className="mb-3 mt-2 border-l-4 border-zinc-700/50 pl-2 ml-1">
                    <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                        className="flex items-center gap-2 text-sm font-bold text-zinc-300 hover:text-white mb-2 group w-full text-left relative z-10 cursor-pointer select-none"
                    >
                        {isOpen ? <ChevronDown size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" /> : <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />}
                        <Layers size={14} className="text-primary opacity-70" />
                        <span className="truncate">{node.name}</span>
                        <span className={clsx("text-[10px] ml-auto px-1.5 py-0.5 rounded border", isFailed ? "border-red-900/50 text-red-400" : "border-green-900/50 text-green-500 bg-green-900/10")}>
                            {node.summary}
                        </span>
                    </div>

                    {isOpen && (
                        <div className="pl-2 space-y-1">
                            {node.documentation && (
                                <div className="text-zinc-500 italic px-2 py-1 text-xs border-b border-zinc-800/50 mb-1">
                                    Documentation: {node.documentation}
                                </div>
                            )}
                            {node.children.map(renderNode)}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div ref={containerRef} className="h-full bg-black/90 rounded-lg p-4 font-mono text-sm overflow-auto border border-zinc-800 shadow-inner custom-scrollbar pointer-events-auto relative z-0 isolate">
            {logs.length === 0 && (
                <div className="text-zinc-500 italic opacity-50 select-none">{t('console.waiting')}</div>
            )}

            <div className="relative z-10 w-full">
                {tree.map(renderNode)}
                {pendingLogs.length > 0 && (
                    <div className="mb-2 mt-1 border border-zinc-800 bg-zinc-900/10 rounded-lg overflow-hidden border-l-2 border-l-blue-500/50">
                        <div className="w-full flex items-center justify-between px-3 py-1.5 bg-blue-500/5 transition-colors text-left relative z-10 select-none">
                            <div className="flex items-center gap-2 max-w-[80%]">
                                <Loader2 size={14} className="text-blue-500 shrink-0 animate-spin" />
                                <span className="font-semibold truncate text-zinc-300 italic">
                                    {pendingLogs[0]}
                                </span>
                            </div>
                            <div className="text-[10px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0 bg-blue-500/10 text-blue-400">
                                RUNNING
                            </div>
                        </div>
                        {pendingLogs.length > 1 && (
                            <div className="p-2 pl-6 bg-black/20 text-xs border-t border-zinc-800/50">
                                {pendingLogs.slice(1).map((line, i) => <LinkRenderer key={`pending-${i}`} content={line} />)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isRunning && logs.length > 0 && (
                <div className="animate-pulse text-blue-500 mt-2 flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    Processing...
                </div>
            )}
        </div>
    );
}
