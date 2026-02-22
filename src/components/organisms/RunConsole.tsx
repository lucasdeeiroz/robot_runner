import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Layers, Star } from "lucide-react";

interface RunConsoleProps {
    logs: string[];
    isRunning?: boolean;
    testPath?: string;
}

interface TextNode {
    type: 'text';
    content: string;
    isSystem?: boolean;
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


import { LinkRenderer } from "../molecules/LinkRenderer";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

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

    // Incremental Parsing State
    const [tree, setTree] = useState<LogNode[]>([]);

    // Auto-scroll on new logs with stick-to-bottom logic
    useEffect(() => {
        const el = containerRef.current;
        if (!el || el.clientHeight === 0) return;

        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

        if (isAtBottom || logs.length < 5) {
            // Small timeout to allow the latest tree nodes to render
            const timer = setTimeout(() => {
                el.scrollTop = el.scrollHeight;
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [logs, tree, isRunning, isRawMode]);

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
        const IS_MAESTRO_VERBOSE = (l: string) => /disableAnsi=false/.test(l) || /\(\[\s*(INFO|DEBUG|ERROR|WARN|TRACE)\s*\]\)/.test(l);
        const IS_SYSTEM = (l: string) => l.trim().startsWith('[System]') || l.trim().startsWith('[Error]') || /^\s*(Output|Log|Report|STDERR|STDOUT):/.test(l) || IS_MAESTRO_VERBOSE(l);
        const IS_MAESTRO_SUITE_START = (l: string) => l.includes("Debug output path:") || l.includes("Waiting for flows to complete...");
        const IS_MAESTRO_SUITE_END = (l: string) => /Flow (Passed|Failed) in/.test(l) || /\d+\/\d+ Flow (Passed|Failed) in/.test(l);
        const IS_MAESTRO_TEST_START = (l: string) => l.includes("Running flow ");
        const IS_MAESTRO_TEST_END = (l: string) => /^\[(Passed|Failed)\]\s+.*\(\d+s\)/.test(l.trim());
        const IS_MAVEN_TEST_START = (l: string) => l.startsWith("[INFO] Running ");
        const IS_MAVEN_TEST_END = (l: string) => l.includes("Tests run: ") && l.includes("Failures: ");

        if (currentCount > processedCount) {
            const newLogs = logs.slice(processedCount);
            const linearNodes = parsedNodesRef.current;

            for (let i = 0; i < newLogs.length; i++) {
                let line = newLogs[i];
                const isSystem = IS_SYSTEM(line);

                // Clean Maestro verbose noise
                if (IS_MAESTRO_VERBOSE(line)) {
                    line = line.replace(/.*disableAnsi=false.*?\]\)\s*/, '').trim();
                }

                if (!line) continue;

                if (IS_DOUBLE(line)) {
                    const last = linearNodes[linearNodes.length - 1];
                    const prev = linearNodes[linearNodes.length - 2];
                    const isPrevDouble = prev?.type === 'text' && IS_DOUBLE(prev.content);
                    const isPrevSuite = prev?.type === 'suite-start' || prev?.type === 'suite-end';

                    if (last?.type === 'text' && !IS_SYSTEM(last.content) && (isPrevDouble || isPrevSuite)) {
                        const suiteName = last.content.trim();
                        linearNodes.pop();
                        if (isPrevDouble) linearNodes.pop();
                        linearNodes.push({ type: 'suite-start', name: suiteName.split(' :: ')[0], originalLine: suiteName, id: `suite-start-${processedCount + i}` });
                        continue;
                    }

                    if (last?.type === 'text' && IS_SUMMARY(last.content)) {
                        const summaryLine = last.content;
                        let statusNodeIndex = -1;
                        for (let k = 1; k <= 5; k++) {
                            const node = linearNodes[linearNodes.length - 1 - k];
                            if (!node || node.type !== 'text') break;
                            if (IS_STATUS(node.content)) {
                                const match = node.content.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);
                                if (match) statusNodeIndex = linearNodes.length - 1 - k;
                                break;
                            }
                        }
                        if (statusNodeIndex !== -1) {
                            const statusNode = linearNodes[statusNodeIndex] as TextNode;
                            const match = statusNode.content.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);
                            if (match) {
                                const name = match[1].trim();
                                const status = match[2] as 'PASS' | 'FAIL';
                                linearNodes.splice(statusNodeIndex);
                                let doc = undefined;
                                let finalName = name;
                                if (finalName.includes(' :: ')) {
                                    const parts = finalName.split(' :: ');
                                    finalName = parts[0].trim();
                                    doc = parts.slice(1).join(' :: ');
                                }
                                linearNodes.push({ type: 'suite-end', name: finalName, status, documentation: doc, summary: summaryLine, id: `suite-end-${processedCount + i}` });
                                continue;
                            }
                        }
                    }
                    linearNodes.push({ type: 'text', content: line, isSystem, id: `div-${processedCount + i}` });
                } else if (IS_MAESTRO_SUITE_START(line)) {
                    linearNodes.push({ type: 'suite-start', name: 'Maestro Suite', originalLine: line, id: `m-suite-start-${processedCount + i}` });
                } else if (IS_MAESTRO_SUITE_END(line)) {
                    const status = line.includes("Passed") ? "PASS" : "FAIL";
                    linearNodes.push({ type: 'suite-end', name: 'Maestro Suite', status, summary: line, id: `m-suite-end-${processedCount + i}` });
                } else {
                    linearNodes.push({ type: 'text', content: line, isSystem, id: `txt-${processedCount + i}` });
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

                if (IS_SINGLE(line) || IS_DOUBLE(line)) {
                    if (currentTest) closeCurrentTest();
                }
                else if (IS_MAESTRO_TEST_START(line)) {
                    closeCurrentTest();
                    const name = line.replace(/.*Running flow\s+/, '').trim();
                    currentTest = {
                        type: 'test',
                        name,
                        status: 'RUNNING',
                        logs: [line],
                        id: `m-test-${processedCountRef.current + idx}`
                    };
                    if (activeSuite()) activeSuite()!.children.push(currentTest);
                    else root.push(currentTest);
                }
                else if (IS_MAESTRO_TEST_END(line)) {
                    const status = line.toLowerCase().includes("passed") ? "PASS" : "FAIL";
                    if (currentTest) {
                        currentTest.status = status;
                        currentTest.logs.push(line);
                        currentTest = null;
                    } else {
                        // Non-verbose mode: Instant test result
                        const name = line.replace(/^\[(Passed|Failed)\]\s+/, '').replace(/\s+\(\d+s\)$/, '').trim();
                        const instantTest: TestNode = {
                            type: 'test',
                            name,
                            status,
                            logs: [line],
                            id: `m-instant-${processedCountRef.current + idx}`
                        };
                        if (activeSuite()) activeSuite()!.children.push(instantTest);
                        else root.push(instantTest);
                    }
                }
                else if (IS_MAVEN_TEST_START(line)) {
                    closeCurrentTest();
                    const name = line.replace("[INFO] Running ", "").trim();
                    currentTest = {
                        type: 'test',
                        name,
                        status: 'RUNNING',
                        logs: [line],
                        id: `mvn-test-${processedCountRef.current + idx}`
                    };
                    if (activeSuite()) activeSuite()!.children.push(currentTest);
                    else root.push(currentTest);
                }
                else if (IS_MAVEN_TEST_END(line)) {
                    if (currentTest) {
                        const isFailed = line.includes("Failures: 0") && line.includes("Errors: 0") ? false : true;
                        currentTest.status = isFailed ? "FAIL" : "PASS";
                        currentTest.logs.push(line);
                        currentTest = null;
                    } else {
                        addToCurrentContext({ type: 'text', content: line, id: nodeId });
                    }
                }
                else {
                    const isSys = node.isSystem;
                    if (isSys) {
                        if (currentTest) {
                            currentTest.logs.push(line);

                            // Heuristic: If system says we stopped/finished, identify if we need to force-fail the current test/suite
                            if (line.includes('[System] Finished:') || line.includes('[System] Stopping...') || line.includes('[System] Toolbox session stopped')) {
                                const isSuccess = line.toLowerCase().includes('exit code: 0');
                                const finalStatus = isSuccess ? 'PASS' : 'FAIL';

                                if (currentTest.status === 'RUNNING') {
                                    currentTest.status = finalStatus;
                                }
                                currentTest = null;

                                // Also update all open suites
                                suiteStack.forEach(s => {
                                    if (s.status === 'RUNNING') s.status = finalStatus;
                                });
                            }
                        } else {
                            addToCurrentContext({ type: 'text', content: line, id: nodeId });
                            // Also check for suites if we are at root level (e.g. suite setup failure or global stop)
                            if (line.includes('[System] Finished:') || line.includes('[System] Stopping...') || line.includes('[System] Toolbox session stopped')) {
                                const isSuccess = line.toLowerCase().includes('exit code: 0');
                                const finalStatus = isSuccess ? 'PASS' : 'FAIL';
                                suiteStack.forEach(s => {
                                    if (s.status === 'RUNNING') s.status = finalStatus;
                                });
                            }
                        }
                    } else {
                        if (currentTest) {
                            currentTest.logs.push(line);
                        } else {
                            // Heuristic: New Test Start
                            // If we are in a Maestro suite, we ONLY start tests via IS_MAESTRO_TEST_START (handled above)
                            const isMaestroSuite = activeSuite()?.name.includes('Maestro');

                            if (line.trim().length > 0 && !isMaestroSuite) {
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

            const isOpen = isRunning ? !isUserToggled : (isFailed ? !isUserToggled : isUserToggled);

            const borderColor = isRunning ? 'border-primary/50' : (isFailed ? 'border-error' : 'border-success');
            const bgColor = isRunning ? 'bg-primary/5' : (isFailed ? 'bg-error/10' : 'bg-success/10');
            const textColor = isRunning ? 'text-info-container/80' : (isFailed ? 'text-red-400' : 'text-success');

            return (
                <div key={node.id} className={clsx("mb-2 mt-1 border rounded-2xl overflow-hidden border-outline-variant", isRunning && "animate-pulse-subtle")}>
                    <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                        className={clsx(
                            "w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface-variant/30 transition-colors text-left relative z-10 cursor-pointer select-none",
                            `border-l-4 ${borderColor.replace('/50', '')}`
                        )}
                    >
                        <div className="flex items-center gap-2 max-w-[80%]">
                            {isOpen ? <ChevronDown size={14} className="text-on-surface-variant/80 shrink-0" /> : <ChevronRight size={14} className="text-on-surface-variant/80 shrink-0" />}
                            <span className={clsx("font-semibold truncate", isRunning ? "text-primary" : (isFailed ? "text-error" : "text-success"))}>
                                {node.name}
                            </span>
                        </div>
                        <div className={clsx(
                            "text-[10px] px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0",
                            bgColor, textColor
                        )}>
                            {isRunning ? <ExpressiveLoading size="xsm" variant="circular" /> : (isFailed ? <XCircle size={12} /> : <CheckCircle2 size={12} />)}
                            {t(isRunning ? 'run_tab.console.running' : (isFailed ? 'run_tab.console.fail' : 'run_tab.console.pass'))}
                        </div>
                    </div>
                    {isOpen && (
                        <div className="p-2 pl-6 bg-surface/50 text-xs border-t border-outline-variant/30 text-on-surface-variant/80">
                            {node.documentation && (
                                <div className="text-on-surface-variant/80 italic mb-2 border-b border-outline-variant/30 pb-1 text-xs">
                                    Documentation: {node.documentation}
                                </div>
                            )}
                            {node.logs.map((line, i) => <LinkRenderer key={i} content={line} />)}
                            {isRunning && (
                                <div className="text-primary mt-2 flex items-center gap-2 text-xs italic opacity-70">
                                    <div className="w-1.5 h-1.5 bg-primary rounded-2xl animate-pulse" />
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

            const borderColor = isRunning ? 'border-outline-variant/30' : (isFailed ? 'border-error/50' : 'border-success/50');
            const summaryColor = isRunning ? 'text-on-surface-variant/80' : (isFailed ? 'text-error' : 'text-success');
            const badgeBg = isRunning ? 'bg-surface-variant/30' : (isFailed ? 'bg-error/10' : 'bg-success/10');

            return (
                <div key={node.id} className="mb-3 mt-2 pl-2 ml-1">
                    <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                        className={clsx(
                            "flex items-center gap-2 text-sm font-bold text-on-surface-variant/80 hover:text-on-surface mb-2 group w-full text-left relative z-10 cursor-pointer select-none rounded p-1 hover:bg-surface-variant/30 transition-colors",
                            `border-l-4 ${borderColor}`
                        )}
                    >
                        {isOpen ? <ChevronDown size={16} className="text-on-surface-variant/80 transition-colors" /> : <ChevronRight size={16} className="text-on-surface-variant/80 transition-colors" />}
                        <Layers size={14} className={clsx("opacity-70", isRunning && "animate-pulse")} />

                        <span className="truncate flex-1">
                            {parentName && node.name.startsWith(parentName + '.') ? node.name.substring(parentName.length + 1) : node.name}
                        </span>

                        {/* Status Badge for Suite */}
                        <span className={clsx("text-[10px] ml-2 px-1.5 py-0.5 rounded border flex items-center gap-1", borderColor, summaryColor, badgeBg)}>
                            {isRunning && <ExpressiveLoading size="xsm" variant="circular" />}
                            {isRunning ? t('run_tab.console.running') : translateSummary(node.summary) || t(node.status === 'FAIL' ? 'run_tab.console.fail' : 'run_tab.console.pass')}
                        </span>
                    </div>

                    {isOpen && (
                        <div className="pl-2 space-y-1 block border-l border-outline-variant/30 ml-2">
                            {node.documentation && (
                                <div className="text-on-surface-variant/80 italic px-2 py-1 text-xs border-b border-outline-variant/30 mb-1">
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
        <div className="h-full flex-1 min-h-0 flex flex-col bg-surface rounded-2xl font-mono text-sm border border-outline-variant/30 shadow-inner pointer-events-auto relative z-0 isolate overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-outline-variant/30 bg-surface/80 backdrop-blur shrink-0 z-20">
                <span className="text-xs text-on-surface-variant/80 font-mono truncate px-2" title={testPath}>{testPath}</span>
                <button
                    onClick={() => setIsRawMode(!isRawMode)}
                    className="p-1 hover:bg-surface-variant/30 rounded transition-colors text-on-surface-variant/80 hover:text-warning"
                    title={isRawMode ? "Enable Fancy Mode" : "Enable Raw Mode"}
                >
                    <Star size={14} fill={!isRawMode ? "currentColor" : "none"} className={clsx(!isRawMode && "text-warning-container/40")} />
                </button>
            </div>

            <div ref={containerRef} className="h-full flex-1 min-h-0 flex flex-col bg-surface overflow-y-auto p-4 font-mono text-xs custom-scrollbar relative">
                {logs.length === 0 && (
                    <div className="text-on-surface-variant/80 italic opacity-50 select-none pb-4">{t('run_tab.console.waiting')}</div>
                )}

                {isRawMode ? (
                    <div className="on-primary space-pre-wrap font-mono text-xs text-on-surface/50 leading-tight">
                        {logs.map((line, i) => (
                            <div key={i} className="min-h-[1.2em]">{line}</div>
                        ))}
                    </div>
                ) : (
                    <div className="relative z-10 w-full mb-8">
                        {tree.map(node => renderNode(node))}
                        {isRunning && (
                            <div className="text-primary mt-4 flex items-center gap-2 text-sm italic opacity-70 animate-pulse ml-2">
                                <ExpressiveLoading size="sm" variant="circular" />
                                {t('run_tab.console.processing', "Processando...")}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
