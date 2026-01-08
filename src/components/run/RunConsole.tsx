import { useEffect, useRef, useState, useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Layers } from "lucide-react";

interface RunConsoleProps {
    logs: string[];
    isRunning?: boolean;
}

type NodeType = 'text' | 'test' | 'suite' | 'suite-end';

interface BaseNode {
    id: string;
    type: NodeType;
}

interface TextNode extends BaseNode {
    type: 'text';
    content: string;
}

interface TestNode extends BaseNode {
    type: 'test';
    name: string;
    documentation?: string; // New field
    status: 'PASS' | 'FAIL';
    logs: string[];
}

interface SuiteNode extends BaseNode {
    type: 'suite';
    name: string;
    documentation?: string; // New field
    status: 'PASS' | 'FAIL';
    children: LogNode[];
    summary: string; // "X tests, Y passed, Z failed"
}

type LogNode = TextNode | TestNode | SuiteNode;

interface SuiteEndNode extends BaseNode {
    type: 'suite-end';
    name: string;
    documentation?: string; // New field
    status: 'PASS' | 'FAIL';
    summary: string;
}

type LinearNode = TextNode | TestNode | SuiteEndNode;

export function RunConsole({ logs, isRunning }: RunConsoleProps) {
    const { t } = useTranslation();


    // State for toggles (Set of IDs)
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new logs
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs, isRunning]); // Added isRunning to ensure scroll on start/stop/update

    // Parse logs into Tree
    const tree = useMemo(() => {
        // Phase 1: Linear Parse into logical blocks
        const linearNodes: LinearNode[] = [];
        let buffer: string[] = [];
        let activeFailGroupId: string | null = null; // Track if we are capturing error details after a FAIL

        // Regex helpers
        const isSeparator = (line: string) => /^[-=]{10,}$/.test(line.trim());

        const processBufferAsText = () => {
            if (buffer.length > 0) {
                buffer.forEach((line, idx) => {
                    linearNodes.push({ type: 'text', content: line, id: `txt-${linearNodes.length}-${idx}` });
                });
                buffer = [];
            }
        };

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];

            // Detect specific "Noise" lines that shouldn't be part of a Test's name buffer
            // 1. Separators
            const separator = isSeparator(log);
            // 2. System Messages (Internal backend logs)
            const isSystem = log.startsWith('[System]');
            // 3. Backend Errors (optional, but good to separate)
            const isError = log.startsWith('[Error]');

            if (separator || isSystem || isError) {
                // If we are currently tracking a failure error message, a separator usually ends it.
                // System messages might just appear in between.
                if (separator && activeFailGroupId) {
                    activeFailGroupId = null;
                }

                // If we are building a test buffer, valid test output shouldn't have [System] lines inserted in the middle usually?
                // Actually, if we have [System] lines, they are instantaneous, so flush buffer text if any, then flush system line.
                // BUT, if we effectively split the buffer, we might lose the "Test Name" if it was printed before [System].
                // Robot: "Test Name" -> [System] (Unlikely) -> " ... " -> | PASS |
                // More likely: [System] -> [System] -> "Test Name" -> ...

                // Safe bet: If we see these lines, treat them as TextNodes immediately.
                // But check if we are in "Error Capture" mode.

                if (activeFailGroupId) {
                    // Add to the failed test's logs if it's NOT a hard separator?
                    // If it's a [System] line, it's likely global, so maybe don't add to test?
                    // Let's stick to: Separator ends error capture. System lines are just logged.
                    // But if we are capturing error, we technically want to capture everything until the next test starts or suite ends?
                    // Robot errors can be multi-line.

                    if (separator) {
                        activeFailGroupId = null;
                        processBufferAsText();
                        linearNodes.push({ type: 'text', content: log, id: `sep-${i}` });
                    } else {
                        // It's a system/error line. Include in the test logs? 
                        // Or break out? User wants "Error message" part of test.
                        // System logs are probably not "Error messages" of the test.
                        // So we push to general linear text.
                        // processBufferAsText(); 
                        // linearNodes.push({ type: 'text', content: log, id: `sys-${i}` });

                        // Wait, if I push to linearNodes, it breaks the 'test-group' container visually?
                        // Yes. The TestGroup renders its `logs`. 
                        // If I push a text node now, it will be a sibling of the TestGroup.
                        // So it appears OUTSIDE the test.
                        // If the user wants it INSIDE, I must push to `logs`.

                        // Robot Error messages are NOT [System] lines. They are plain text.
                        // So `isSystem` check handling is fine for [System].

                        // If normal text (Error message), it falls through to "normal line" logic below, which checks activeFailGroupId first.
                        // So this block is strictly for System/Separator.

                        if (isSystem || isError) {
                            // If we are capturing, maybe we should stop capturing?
                            // No, let's keep capturing normal text. But System lines should probably be outside.
                            activeFailGroupId = null;
                            processBufferAsText();
                            linearNodes.push({ type: 'text', content: log, id: `sys-${i}` });
                        }
                    }
                    continue;
                }

                // Normal Mode (Not capturing error)
                processBufferAsText();
                linearNodes.push({ type: 'text', content: log, id: `sys-${i}` });
                continue;
            }

            // Check for Status Line
            const statusMatch = log.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);

            if (statusMatch) {
                // End of Test or Suite
                const fullPrefix = statusMatch[1].trim();
                const status = statusMatch[2] as 'PASS' | 'FAIL';

                // Handle Documentation " :: " split
                let name = fullPrefix;
                let documentation: string | undefined = undefined;
                if (fullPrefix.includes(" :: ")) {
                    const parts = fullPrefix.split(" :: ");
                    name = parts[0].trim();
                    documentation = parts.slice(1).join(" :: ").trim();
                }

                // Look ahead for Suite Summary
                const nextLine = logs[i + 1];
                const summaryMatch = nextLine?.match(/^(\d+) tests?, (\d+) passed, (\d+) failed/);

                if (summaryMatch) {
                    // Suite End
                    if (activeFailGroupId) activeFailGroupId = null; // Safety

                    // Ensure buffer is processed. 
                    // Note: Suite End lines usually don't have predecessors in the buffer that belong to them specifically, 
                    // except maybe teardown?
                    processBufferAsText();

                    linearNodes.push({
                        type: 'suite-end',
                        name: name, // Store clean name for matching
                        documentation, // Pass doc
                        status,
                        summary: nextLine,
                        id: `suite-${linearNodes.length}`
                    });
                    i++;
                } else {
                    // Test End
                    if (activeFailGroupId) activeFailGroupId = null; // New test ending closes previous failure capture if any (should have been closed by separator, but just in case)

                    // Test Name Logic
                    // We need to filter the buffer to find the likely Name candidate.
                    // Buffer might contain "noise" if our previous filters failed or if there's random stdout.
                    // Strategy: The *first* non-empty line in buffer is the Name.
                    // If buffer is empty, use the namePrefix from the status line.

                    let testName = name; // Use extracted name
                    let logsStartIdx = 0;

                    // Cleanup buffer for name search
                    // Find first non-empty line
                    const nameIdx = buffer.findIndex(l => l.trim().length > 0 && !l.startsWith('[System]') && !isSeparator(l));

                    if (nameIdx !== -1) {
                        // Found a preceding line. Does it match the extracted name?
                        const bufferLine = buffer[nameIdx].trim();
                        // The buffer line might also contain " :: "
                        let bufferName = bufferLine;
                        let bufferDoc = undefined;

                        if (bufferLine.includes(" :: ")) {
                            const parts = bufferLine.split(" :: ");
                            bufferName = parts[0].trim();
                            bufferDoc = parts.slice(1).join(" :: ").trim();
                        }

                        // Logic: If status-line name is empty or we prefer buffer name (usually longer/cleaner)
                        // If testName (from status) is empty, definitely use buffer.
                        // If testName exists, check if bufferName looks like it.
                        if (!testName || bufferName.includes(testName) || testName.includes(bufferName)) {
                            testName = bufferName;
                            // If we didn't get doc from status line, maybe we got it from buffer?
                            if (!documentation && bufferDoc) {
                                documentation = bufferDoc;
                            }
                        }

                        // Logs start AFTER the name line
                        logsStartIdx = nameIdx + 1;
                    }

                    const testLogs = buffer.slice(logsStartIdx);
                    testLogs.push(log); // Add status line

                    const id = `test-${linearNodes.length}`;

                    linearNodes.push({
                        type: 'test',
                        name: testName,
                        documentation, // Pass doc
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
                // Not a status line.
                // If we are in "Error Capture" mode (activeFailGroupId), append to that test.
                if (activeFailGroupId) {
                    // We need to find the node in linearNodes.
                    // Since it was just pushed (or recently pushed), it's at the end or close to it.
                    // Optimization: We know ID.

                    const targetNode = linearNodes.find(n => n.id === activeFailGroupId);
                    if (targetNode && targetNode.type === 'test') {
                        targetNode.logs.push(log);
                    } else {
                        // Should not happen, but if node lost, treat as text
                        buffer.push(log);
                    }
                } else {
                    buffer.push(log);
                }
            }
        }
        processBufferAsText();

        // Phase 2: Reduce to Tree
        const stack: LogNode[] = [];

        linearNodes.forEach(node => {
            if (node.type === 'suite-end') {
                // Collect children from stack
                // Scan backwards for a matching "Start" text node or hit a boundary
                const cleanName = node.name.replace(/\.\.\.$/, '').trim();

                let foundStart = false;
                const tempChildren: LogNode[] = [];

                while (stack.length > 0) {
                    const top = stack.pop()!;
                    tempChildren.unshift(top); // Add to front to maintain order

                    // Check if this node is the Start Declaration
                    if (top.type === 'text') {
                        if (top.content.includes(cleanName) || (cleanName.includes(' ') && top.content.startsWith(cleanName.split(' ')[0]))) {
                            foundStart = true;
                            break;
                        }
                    }
                }

                if (!foundStart) {
                    // Safety fallback: if no start found, maybe we popped everything.
                    // Ideally log this.
                }

                // Create Suite Node
                // Logic: "Parent.Child" -> "Child" for display
                // The nesting structure (children array) provides the hierarchy.
                const displayName = node.name.split('.').pop() || node.name;

                const suiteNode: SuiteNode = {
                    type: 'suite',
                    id: node.id,
                    name: displayName,
                    documentation: node.documentation, // From SuiteEndNode
                    status: node.status,
                    summary: node.summary,
                    children: tempChildren
                };
                stack.push(suiteNode);

            } else {
                if (node.type === 'test' || node.type === 'text') {
                    stack.push(node);
                }
            }
        });

        return stack;
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
        if (node.type === 'text') {
            // Filter out separators for cleaner UI?
            if (node.content.match(/^[-=]+$/)) return null;
            // Also filter out standard Empty lines if desired, or keep spacing
            return <LinkRenderer key={node.id} content={node.content} />;
        }

        if (node.type === 'test') {
            // Tests: Default Collapsed if PASS, Expanded if FAIL
            const isFailed = node.status === 'FAIL';
            const isUserToggled = collapsedIds.has(node.id); // If in set, it is TOGGLED (inverted from default)

            // Logic:
            // Fail -> Default Open. Toggled -> Closed.
            // Pass -> Default Closed. Toggled -> Open.
            const isOpen = isFailed ? !isUserToggled : isUserToggled;

            return (
                <div key={node.id} className="mb-2 mt-1 border border-zinc-800 bg-zinc-900/30 rounded-lg overflow-hidden">
                    <button
                        onClick={() => toggleNode(node.id)}
                        className={clsx(
                            "w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800/50 transition-colors text-left",
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
                    </button>
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
                    <button
                        onClick={() => toggleNode(node.id)}
                        className="flex items-center gap-2 text-sm font-bold text-zinc-300 hover:text-white mb-2 group w-full text-left"
                    >
                        {isOpen ? <ChevronDown size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" /> : <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />}
                        <Layers size={14} className="text-primary opacity-70" />
                        <span className="truncate">{node.name}</span>
                        <span className={clsx("text-[10px] ml-auto px-1.5 py-0.5 rounded border", isFailed ? "border-red-900/50 text-red-400" : "border-green-900/50 text-green-500 bg-green-900/10")}>
                            {node.summary}
                        </span>
                    </button>

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
        <div ref={containerRef} className="h-full bg-black/90 rounded-lg p-4 font-mono text-sm overflow-auto border border-zinc-800 shadow-inner custom-scrollbar">
            {logs.length === 0 && (
                <div className="text-zinc-500 italic opacity-50 select-none">{t('console.waiting')}</div>
            )}

            {tree.map(renderNode)}

            {isRunning && logs.length > 0 && (
                <div className="animate-pulse text-blue-500 mt-2 flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    Processing...
                </div>
            )}
        </div>
    );
}
