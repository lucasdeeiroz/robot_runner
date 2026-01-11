import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Layers, Loader2, Star } from "lucide-react";

interface RunConsoleProps {
    logs: string[];
    isRunning?: boolean;
    testPath?: string;
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
    status: 'PASS' | 'FAIL' | 'RUNNING';
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
    status: 'PASS' | 'FAIL' | 'RUNNING';
    summary: string;
    children: LogNode[];
}

type LogNode = TextNode | SuiteStartNode | TestNode | SuiteNode | SuiteEndNode;
type LinearNode = TextNode | SuiteStartNode | SuiteEndNode;


export function RunConsole({ logs, isRunning, testPath }: RunConsoleProps) {
    const { t } = useTranslation();
    const [isRawMode, setIsRawMode] = useState(false);

    const translateSummary = (summary: string) => {
        if (!summary) return summary;
        // Match "X tests, Y passed, Z failed"
        const match = summary.match(/(\d+) tests?, (\d+) passed, (\d+) failed/);
        if (match) {
            return t('run_tab.console.test_summary', {
                total: match[1],
                passed: match[2],
                failed: match[3]
            });
        }
        return summary;
    };


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
    }, [logs, isRunning, isRawMode]);

    // Incremental Parsing State
    const [tree, setTree] = useState<LogNode[]>([]);

    // Persistent Parsing Context
    const parsedNodesRef = useRef<LinearNode[]>([]);
    const processedCountRef = useRef<number>(0);
    // Buffer for edge cases (e.g. waiting for next line to confirm Suite End)
    // Actually, with strict logic, we might just look backwards in linearNodes
    const bufferRef = useRef<string[]>([]);
    // Track if we are tentatively expecting a Suite Start sequence
    const pendingSuiteStartRef = useRef<boolean>(false);

    // Reset state if logs are cleared
    useEffect(() => {
        if (logs.length < processedCountRef.current) {
            parsedNodesRef.current = [];
            processedCountRef.current = 0;
            bufferRef.current = [];
            pendingSuiteStartRef.current = false;
            setTree([]);
        }
    }, [logs.length]);

    // Parse incremental logs
    useEffect(() => {
        const currentCount = logs.length;
        const processedCount = processedCountRef.current;

        // Constants
        const IS_DOUBLE = (l: string) => /^={10,}$/.test(l.trim());
        const IS_SINGLE = (l: string) => /^-{10,}$/.test(l.trim());
        const IS_STATUS = (l: string) => / \|\s+(PASS|FAIL)\s+\|/.test(l); // Loose match for table status
        const IS_SUMMARY = (l: string) => /^\d+ tests?, \d+ passed, \d+ failed/.test(l.trim());
        const IS_SYSTEM = (l: string) => l.trim().startsWith('[System]') || l.trim().startsWith('[Error]') || /^\s*(Output|Log|Report):/.test(l);

        if (currentCount > processedCount) {
            const newLogs = logs.slice(processedCount);
            const linearNodes = parsedNodesRef.current;

            for (let i = 0; i < newLogs.length; i++) {
                const line = newLogs[i];

                // Pattern Recognition
                if (IS_DOUBLE(line)) {
                    // Double Divider. 
                    const last = linearNodes[linearNodes.length - 1];
                    const prev = linearNodes[linearNodes.length - 2];

                    // Check for Suite Header Sandwich (==== Name ====)
                    // We allow 'prev' to be a 'suite-start' or 'suite-end' to handle shared delimiters (==== Name1 ==== Name2 ====)
                    const isPrevDouble = prev?.type === 'text' && IS_DOUBLE(prev.content);
                    const isPrevSuite = prev?.type === 'suite-start' || prev?.type === 'suite-end';

                    if (last?.type === 'text' && !IS_SYSTEM(last.content) && (isPrevDouble || isPrevSuite)) {
                        // Found Sandwich!
                        const suiteName = last.content.trim();

                        linearNodes.pop(); // Remove Name (Text)
                        if (isPrevDouble) {
                            linearNodes.pop(); // Remove Opening Double Divider
                        }
                        // If isPrevSuite, we don't remove it, as it serves as the shared boundary

                        linearNodes.push({
                            type: 'suite-start',
                            name: suiteName.split(' :: ')[0],
                            originalLine: suiteName,
                            id: `suite-start-${processedCount + i}`
                        });
                        continue;
                    }

                    // Case B: Closing a Suite End? (Summary , ====)
                    if (last?.type === 'text' && IS_SUMMARY(last.content)) {
                        const summaryLine = last.content;

                        // Scan backwards for Status Line (max 5 lines)
                        // It must be a text node matching IS_STATUS
                        let statusNodeIndex = -1;
                        for (let k = 1; k <= 5; k++) {
                            const node = linearNodes[linearNodes.length - 1 - k];
                            if (!node) break;
                            if (node.type !== 'text') break; // Don't cross structural boundaries

                            if (IS_STATUS(node.content)) {
                                const match = node.content.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);
                                if (match) {
                                    statusNodeIndex = linearNodes.length - 1 - k;
                                }
                                break; // Found or not (if looks like status but regex fails, stop?) -> actually IS_STATUS checks regex roughly
                            }
                        }

                        if (statusNodeIndex !== -1) {
                            const statusNode = linearNodes[statusNodeIndex] as TextNode;
                            const match = statusNode.content.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);

                            if (match) {
                                const name = match[1].trim();
                                const status = match[2] as 'PASS' | 'FAIL';

                                // Clean up linearNodes: Remove everything from StatusNode to Last (Summary)
                                // This removes Status, Summary, and any intervening text/divs
                                linearNodes.splice(statusNodeIndex);

                                let doc = undefined;
                                let finalName = name;
                                if (finalName.includes(' :: ')) {
                                    const parts = finalName.split(' :: ');
                                    finalName = parts[0].trim();
                                    doc = parts.slice(1).join(' :: ');
                                }

                                linearNodes.push({
                                    type: 'suite-end',
                                    name: finalName,
                                    status,
                                    documentation: doc,
                                    summary: summaryLine,
                                    id: `suite-end-${processedCount + i}`
                                });
                                continue;
                            }
                        }
                    }

                    linearNodes.push({ type: 'text', content: line, id: `div-${processedCount + i}` });

                } else {
                    linearNodes.push({ type: 'text', content: line, id: `txt-${processedCount + i}` });
                }
            }

            processedCountRef.current = currentCount;
        }

        // Rebuild Tree from Linear Nodes (Reference-based)
        const root: LogNode[] = [];
        const suiteStack: SuiteNode[] = [];
        let currentTest: TestNode | null = null;

        const addToCurrentContext = (node: LogNode) => {
            if (currentTest && node.type === 'text') {
                // Text inside a test -> Log
                currentTest.logs.push(node.content);
                return;
            }

            // If it's a structural node (Suite/Test) or text outside test
            if (suiteStack.length > 0) {
                suiteStack[suiteStack.length - 1].children.push(node);
            } else {
                root.push(node);
            }
        };

        const activeSuite = () => suiteStack.length > 0 ? suiteStack[suiteStack.length - 1] : null;

        const closeCurrentTest = () => {
            if (currentTest) {
                const logs = currentTest.logs;
                for (let j = logs.length - 1; j >= 0; j--) {
                    const match = logs[j].match(/\|\s+(PASS|FAIL)\s+\|/);
                    if (match) {
                        currentTest.status = match[1] as 'PASS' | 'FAIL';
                        break;
                    }
                }
                currentTest = null;
            }
        };

        const linearNodes = parsedNodesRef.current;
        linearNodes.forEach((node, idx) => {
            const nodeId = node.id || `node-${processedCountRef.current + idx}`;

            if (node.type === 'suite-start') {
                closeCurrentTest();

                const newSuite: SuiteNode = {
                    type: 'suite',
                    id: nodeId,
                    name: node.name,
                    status: 'RUNNING', // Instant Running Status
                    summary: '',
                    children: []
                };

                if (activeSuite()) {
                    activeSuite()!.children.push(newSuite);
                } else {
                    root.push(newSuite);
                }
                suiteStack.push(newSuite);

            } else if (node.type === 'suite-end') {
                closeCurrentTest();

                const targetName = node.name;
                let matchIndex = -1;

                // Find strictly matching suite
                // Find matching suite
                // Normalize names: Remove trailing '...' or '..' (Truncation)
                const normalize = (n: string) => n.replace(/\.{2,}$/, '').trim();
                const cleanTarget = normalize(targetName);

                for (let i = suiteStack.length - 1; i >= 0; i--) {
                    const s = suiteStack[i];
                    const cleanStack = normalize(s.name);

                    // Match if identical, or one is prefix of another (handling truncation)
                    if (cleanStack === cleanTarget || cleanStack.startsWith(cleanTarget) || cleanTarget.startsWith(cleanStack)) {
                        matchIndex = i;
                        break;
                    }
                }

                if (matchIndex !== -1) {
                    const suite = suiteStack[matchIndex];
                    suite.status = node.status;
                    suite.summary = node.summary;
                    suite.documentation = node.documentation;
                    // Close suite (pop stack down to here)
                    suiteStack.splice(matchIndex);
                }

            } else if (node.type === 'text') {
                const line = node.content;

                if (IS_SINGLE(line)) {
                    if (currentTest) closeCurrentTest();
                } else if (IS_DOUBLE(line)) {
                    if (currentTest) closeCurrentTest();
                } else {
                    const isSys = IS_SYSTEM(line);
                    if (isSys) {
                        if (currentTest) currentTest.logs.push(line);
                        else addToCurrentContext({ type: 'text', content: line, id: nodeId });
                    } else {
                        if (currentTest) {
                            currentTest.logs.push(line);
                        } else {
                            // Heuristic: New Test Start
                            if (line.trim().length > 0) {
                                let name = line.trim();
                                if (name.includes(' :: ')) name = name.split(' :: ')[0].trim();

                                // Check if name line includes status (e.g. "Test Name | PASS |")
                                const statusMatch = name.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);
                                if (statusMatch) {
                                    name = statusMatch[1].trim();
                                }

                                const newTest: TestNode = {
                                    type: 'test',
                                    name: name,
                                    status: 'RUNNING',
                                    logs: [line],
                                    id: `test-${nodeId}`
                                };

                                if (activeSuite()) {
                                    activeSuite()!.children.push(newTest);
                                } else {
                                    root.push(newTest);
                                }
                                currentTest = newTest;
                            } else {
                                addToCurrentContext({ type: 'text', content: line, id: nodeId });
                            }
                        }
                    }
                }
            }
        });

        // Loop finished. 
        setTree(root);

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
    const renderNode = (node: LogNode, parentName?: string) => {
        if (node.type === 'text') {
            if (node.content.match(/^[-=]+$/)) return null; // Hide separators
            return <LinkRenderer key={node.id} content={node.content} />;
        }

        if (node.type === 'test') {
            const isRunning = node.status === 'RUNNING';
            const isFailed = node.status === 'FAIL';
            const isUserToggled = collapsedIds.has(node.id); // If in set, it is TOGGLED (inverted)

            // Running tests always open (unless toggled explicitly?)
            // Failed tests default open.
            // Passed tests default closed.
            const isOpen = isRunning ? !isUserToggled : (isFailed ? !isUserToggled : isUserToggled);

            const borderColor = isRunning ? 'border-blue-500/50' : (isFailed ? 'border-red-500' : 'border-green-500');
            const bgColor = isRunning ? 'bg-blue-500/5' : (isFailed ? 'bg-red-500/10' : 'bg-green-500/10');
            const textColor = isRunning ? 'text-blue-400' : (isFailed ? 'text-red-400' : 'text-green-500');

            return (
                <div key={node.id} className={clsx("mb-2 mt-1 border rounded-lg overflow-hidden border-zinc-800", isRunning && "animate-pulse-subtle")}>
                    <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                        className={clsx(
                            "w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800/50 transition-colors text-left relative z-10 cursor-pointer select-none",
                            `border-l-4 ${borderColor.replace('/50', '')}`
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
                            bgColor, textColor
                        )}>
                            {isRunning ? <Loader2 size={12} className="animate-spin" /> : (isFailed ? <XCircle size={12} /> : <CheckCircle2 size={12} />)}
                            {t(isRunning ? 'run_tab.console.running' : (isFailed ? 'run_tab.console.fail' : 'run_tab.console.pass'))}
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
                            {isRunning && (
                                <div className="text-blue-500 mt-2 flex items-center gap-2 text-xs italic opacity-70">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                    Processing...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (node.type === 'suite') {
            const isRunning = node.status === 'RUNNING';
            const isFailed = node.status === 'FAIL';
            const isToggled = collapsedIds.has(node.id);
            const isOpen = !isToggled; // Suites default Open

            const borderColor = isRunning ? 'border-zinc-700' : (isFailed ? 'border-red-900/50' : 'border-green-900/50');
            const summaryColor = isRunning ? 'text-zinc-400' : (isFailed ? 'text-red-400' : 'text-green-500');

            return (
                <div key={node.id} className="mb-3 mt-2 pl-2 ml-1">
                    <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                        className={clsx(
                            "flex items-center gap-2 text-sm font-bold text-zinc-300 hover:text-white mb-2 group w-full text-left relative z-10 cursor-pointer select-none rounded p-1 hover:bg-white/5 transition-colors",
                            `border-l-4 ${borderColor}`
                        )}
                    >
                        {isOpen ? <ChevronDown size={16} className="text-zinc-500 transition-colors" /> : <ChevronRight size={16} className="text-zinc-500 transition-colors" />}
                        <Layers size={14} className={clsx("opacity-70", isRunning && "animate-pulse")} />

                        <span className="truncate flex-1">
                            {parentName && node.name.startsWith(parentName + '.') ? node.name.substring(parentName.length + 1) : node.name}
                        </span>

                        {/* Status Badge for Suite */}
                        <span className={clsx("text-[10px] ml-2 px-1.5 py-0.5 rounded border flex items-center gap-1", borderColor, summaryColor, isRunning && "bg-zinc-800")}>
                            {isRunning && <Loader2 size={10} className="animate-spin" />}
                            {isRunning ? t('run_tab.console.running') : translateSummary(node.summary) || t(node.status === 'FAIL' ? 'run_tab.console.fail' : 'run_tab.console.pass')}
                        </span>
                    </div>

                    {isOpen && (
                        <div className="pl-2 space-y-1 block border-l border-zinc-800/50 ml-2">
                            {node.documentation && (
                                <div className="text-zinc-500 italic px-2 py-1 text-xs border-b border-zinc-800/50 mb-1">
                                    {node.documentation}
                                </div>
                            )}
                            {node.children.map(child => renderNode(child, node.name))}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="h-full flex flex-col bg-black/90 rounded-lg font-mono text-sm border border-zinc-800 shadow-inner pointer-events-auto relative z-0 isolate overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur shrink-0 z-20">
                <span className="text-xs text-zinc-500 font-mono truncate px-2" title={testPath}>{testPath}</span>
                <button
                    onClick={() => setIsRawMode(!isRawMode)}
                    className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-yellow-400"
                    title={isRawMode ? "Enable Fancy Mode" : "Enable Raw Mode"}
                >
                    <Star size={14} fill={!isRawMode ? "currentColor" : "none"} className={clsx(!isRawMode && "text-yellow-400")} />
                </button>
            </div>

            <div ref={containerRef} className="flex-1 overflow-auto p-4 custom-scrollbar relative z-0">
                {logs.length === 0 && (
                    <div className="text-zinc-500 italic opacity-50 select-none pb-4">{t('run_tab.console.waiting')}</div>
                )}

                {isRawMode ? (
                    <div className="whitespace-pre-wrap font-mono text-xs text-zinc-300 leading-tight">
                        {logs.map((line, i) => (
                            <div key={i} className="min-h-[1.2em]">{line}</div>
                        ))}
                    </div>
                ) : (
                    <div className="relative z-10 w-full">
                        {tree.map(node => renderNode(node))}
                    </div>
                )}
            </div>
        </div>
    );
}
