import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Star, ExternalLink, XCircle, FileOutput } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { XMLParser } from "fast-xml-parser";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/atoms/Button";
import { 
    LogNode, mapXmlNode, 
    LinearNode, SuiteNode, TestNode, TextNode
} from "@/lib/robotParser";
import { LogTree } from "@/components/molecules/LogTree";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface RunConsoleProps {
    logs: string[];
    isSessionRunning?: boolean;
    testPath?: string;
}

export function RunConsole({ logs, isSessionRunning: isRunning, testPath }: RunConsoleProps) {
    const { t } = useTranslation();
    const [isRawMode, setIsRawMode] = useState(false);


    const containerRef = useRef<HTMLDivElement>(null);

    // Incremental Parsing State
    const [tree, setTree] = useState<LogNode[]>([]);
    const [artifactPaths, setArtifactPaths] = useState<{ log?: string, report?: string, output?: string }>({});

    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [systemLogs, setSystemLogs] = useState<string[]>([]);

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



    // Parse output.xml when artifacts are detected or session finishes
    useEffect(() => {
        if (isRunning || !artifactPaths.output) return;

        const parseOutputXml = async () => {
            // Add a small delay to ensure Robot Framework has finished flushing the file to disk
            await new Promise(resolve => setTimeout(resolve, 800));
            try {
                // Use backend read_file to bypass frontend FS scope restrictions
                const xmlContent = await invoke<string>("read_file", { path: artifactPaths.output! });
                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
                const jsonObj = parser.parse(xmlContent);

                const readImageBase64 = async (path: string) => {
                    return await invoke<string>("read_image_base64", { path });
                };

                const robotObj = jsonObj.robot;
                if (robotObj && robotObj.suite) {
                    const rootNode = await mapXmlNode(robotObj.suite, artifactPaths.output!, readImageBase64, 'suite');
                    if (rootNode) setTree([rootNode]);
                }

                setDebugInfo({
                    xmlLength: xmlContent.length,
                    status: 'Parsed'
                });
            } catch (e: any) {
                console.error("Failed to parse output.xml:", e);
                setSystemLogs(prev => [...prev, `XML Error: ${e.message || String(e)}`]);
                setDebugInfo({ error: e.message || String(e) });
            }
        };

        parseOutputXml();
    }, [isRunning, artifactPaths.output]);

    // Parse incremental logs
    useEffect(() => {
        const currentCount = logs.length;
        const processedCount = processedCountRef.current;

        // Reset state if logs are cleared or significantly reduced (new session)
        if (currentCount < processedCount || currentCount === 0) {
            parsedNodesRef.current = [];
            processedCountRef.current = 0;
            bufferRef.current = [];
            pendingSuiteStartRef.current = false;
            pendingSuiteStartRef.current = false;
            setArtifactPaths({});
            setTree([]);
            return; // Exit and wait for next tick with reset state
        }

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
        const IS_ROBOT_RUNNER_TEST_START = (l: string) => l.startsWith("[RobotRunner-Test-Start]");

        if (currentCount > processedCount) {
            const newLogs = logs.slice(processedCount);
            const linearNodes = parsedNodesRef.current;

            for (let i = 0; i < newLogs.length; i++) {
                let line = newLogs[i];
                // Strip ANSI codes and non-printable characters for cleaner matching
                const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim();
                const isSystem = IS_SYSTEM(line);

                // Robust Artifact Extraction from clean line
                // Handle optional quotes and multiple spaces
                const outputMatch = cleanLine.match(/Output:\s+["']?(.*\.xml)["']?/i);
                if (outputMatch) setArtifactPaths(prev => ({ ...prev, output: outputMatch[1].trim() }));

                const logMatch = cleanLine.match(/Log:\s+["']?(.*\.html)["']?/i);
                if (logMatch) setArtifactPaths(prev => ({ ...prev, log: logMatch[1].trim() }));

                const reportMatch = cleanLine.match(/Report:\s+["']?(.*\.html)["']?/i);
                if (reportMatch) setArtifactPaths(prev => ({ ...prev, report: reportMatch[1].trim() }));

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
                            // Suppress the test name lines and markers from inside the test's own log section
                            // to avoid duplicating the name inside the collapsible UI section
                            const isMarker = IS_ROBOT_RUNNER_TEST_START(line);
                            const nameOnly = line.trim().split(' :: ')[0].trim();
                            const isTestNameLine = nameOnly === currentTest.name || line.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/)?.[1].trim() === currentTest.name;

                            if (!isMarker && !isTestNameLine) {
                                currentTest.logs.push(line);
                            }
                        } else {
                            // Intercept forced Real-Time Test Start (via Python Listener)
                            if (IS_ROBOT_RUNNER_TEST_START(line)) {
                                const name = line.replace("[RobotRunner-Test-Start]", "").trim();
                                const newTest: TestNode = {
                                    type: 'test',
                                    name: name,
                                    status: 'RUNNING',
                                    logs: [], // Exclude marker itself from user logs
                                    id: `test-started-${nodeId}`
                                };

                                if (activeSuite()) {
                                    activeSuite()!.children.push(newTest);
                                } else {
                                    root.push(newTest);
                                }
                                currentTest = newTest;
                            } else {
                                // Fallback Heuristic: New Test Start
                                // If we are in a Maestro suite, we ONLY start tests via IS_MAESTRO_TEST_START (handled above)
                                const isMaestroSuite = activeSuite()?.name.includes('Maestro');

                                if (line.trim().length > 0 && !isMaestroSuite && !line.includes('[RobotRunner-Test-Start]')) {
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
            }
        });

        // Loop finished. 
        setTree(root);

    }, [logs]);



    return (
        <div className="h-full flex-1 min-h-0 flex flex-col bg-surface rounded-2xl font-mono text-sm border border-outline-variant/30 shadow-inner pointer-events-auto relative z-0 isolate overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-outline-variant/30 bg-surface/80 backdrop-blur shrink-0 z-20">
                <span className="text-xs text-on-surface-variant/80 font-mono truncate px-2" title={testPath}>{testPath}</span>
                <button
                    onClick={() => setIsRawMode(!isRawMode)}
                    className="p-1 hover:bg-surface-variant/30 rounded transition-colors text-on-surface-variant/80 hover:text-warning"
                    title={isRawMode ? t('run_tab.console.fancy_mode') : t('run_tab.console.raw_mode')}
                >
                    <Star size={14} fill={!isRawMode ? "currentColor" : "none"} className={clsx(!isRawMode && "text-warning-container/40")} />
                </button>
            </div>

            {/* Artifacts Toolbar */}
            {!isRunning && (artifactPaths.log || artifactPaths.report) && (
                <div className="px-4 py-2 border-b border-outline-variant/30 bg-surface-variant/10 flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-bold uppercase text-on-surface-variant/60 tracking-wider flex items-center gap-1 mr-2">
                        <FileOutput size={12} />
                        {t('run_tab.console.artifacts', 'Artifacts')}
                    </span>
                    {artifactPaths.log && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPath(artifactPaths.log!)}
                            leftIcon={<ExternalLink size={14} />}
                            className="h-7 text-xs bg-surface border border-outline-variant/30 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all rounded-lg px-3"
                        >
                            {t('run_tab.console.open_log', 'Open HTML Log')}
                        </Button>
                    )}
                    {artifactPaths.report && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPath(artifactPaths.report!)}
                            leftIcon={<ExternalLink size={14} />}
                            className="h-7 text-xs bg-surface border border-outline-variant/30 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all rounded-lg px-3"
                        >
                            {t('run_tab.console.open_report', 'Open Report')}
                        </Button>
                    )}
                </div>
            )}

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
                        {tree.map(node => <LogTree key={node.id} node={node} />)}
                        {isRunning && (
                            <div className="text-primary dark:text-primary/80 mt-4 flex items-center gap-2 text-sm italic opacity-70 animate-pulse ml-2">
                                <ExpressiveLoading size="sm" variant="circular" />
                                {t('run_tab.console.processing', "Processing...")}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* System Logs Overlay for Debugging */}
            {systemLogs.length > 0 && (
                <div className="fixed bottom-4 right-4 z-[100] max-w-sm bg-black/95 border border-error/50 rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 ring-1 ring-white/10">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-error flex items-center gap-1.5">
                            <XCircle size={12} /> System Debug
                        </span>
                        <button onClick={() => setSystemLogs([])} className="text-white/40 hover:text-white transition-colors p-1 hover:bg-white/5 rounded">
                            <XCircle size={14} />
                        </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2 thin-scrollbar">
                        {debugInfo && (
                            <div className="text-[9px] font-mono text-primary/80 bg-primary/5 p-2 rounded border border-primary/20 mb-3">
                                <div>XML Size: {debugInfo.xmlLength || 0} bytes</div>
                                <div>Failures: {debugInfo.failuresFound || 0}</div>
                                {debugInfo.error && <div className="text-error">Error: {debugInfo.error}</div>}
                            </div>
                        )}
                        {systemLogs.map((log, i) => (
                            <div key={i} className="text-[10px] font-mono text-white/80 leading-relaxed border-b border-white/5 pb-2 last:border-0">{log}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default RunConsole;
