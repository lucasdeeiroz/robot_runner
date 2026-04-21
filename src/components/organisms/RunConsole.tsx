import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Star, ExternalLink, FileOutput, Eye, EyeOff, Terminal, X } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { parseXmlBackground } from "@/lib/xmlParseCache";
import { Button } from "@/components/atoms/Button";
import {
    LogNode,
    LinearNode, SuiteNode, TestNode, TextNode
} from "@/lib/robotParser";
import { LogTree } from "@/components/molecules/LogTree";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { useTestSessions } from "@/lib/testSessionStore";
import { AiButton } from "@/components/atoms/AiButton";
import { AiResponse } from "@/components/molecules/AiResponse";
import { useSettings } from "@/lib/settings";
import * as gemini from "@/lib/dashboard/gemini";
import * as openai from "@/lib/dashboard/openai";
import * as claude from "@/lib/dashboard/claude";
import { flattenLogNodes } from "@/lib/logTreeFlattening";
import { useCallback, useMemo } from "react";

interface RunConsoleProps {
    runId: string;
    logs: string[];
    isSessionRunning?: boolean;
    testPath?: string;
}

export function RunConsole({ runId, logs, isSessionRunning: isRunning, testPath }: RunConsoleProps) {
    const { t, i18n } = useTranslation();
    const { sessions, setSessionTree, updateSessionArtifacts } = useTestSessions();
    const session = sessions.find(s => s.runId === runId);

    const [isRawMode, setIsRawMode] = useState(false);
    const [isKeepAwake, setIsKeepAwake] = useState(false);
    const [showDebugConsole, setShowDebugConsole] = useState(false);
    const [stickToBottom, setStickToBottom] = useState(true);

    const { settings } = useSettings();
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const debugVirtuosoRef = useRef<VirtuosoHandle>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tree, setTree] = useState<LogNode[]>(() => session?.repopulatedTree ? [session.repopulatedTree] : []);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [artifactPaths, setArtifactPaths] = useState(() => session?.artifactPaths || {});

    const visibleNodes = useMemo(() => flattenLogNodes(tree, expandedIds), [tree, expandedIds]);

    const handleToggleExpand = useCallback((id: string, expanded: boolean) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (expanded) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

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
        if (session?.artifactPaths && JSON.stringify(session.artifactPaths) !== JSON.stringify(artifactPaths)) {
            setArtifactPaths(session.artifactPaths);
        }
    }, [session?.repopulatedTree, session?.artifactPaths]);

    // Auto-scroll logic for tree (Non-virtualized part)
    useEffect(() => {
        if (!isRawMode && stickToBottom && !showDebugConsole) {
            const el = containerRef.current;
            if (el) {
                const timer = setTimeout(() => {
                    el.scrollTop = el.scrollHeight;
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [tree, isRawMode, stickToBottom, showDebugConsole]);

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
    const bufferRef = useRef<string[]>([]);
    const pendingSuiteStartRef = useRef<boolean>(false);

    // Track if post-test re-parse is in progress
    const [reparseLoading, setReparseLoading] = useState(false);

    useEffect(() => {
        // Skip if running, or no output path, or tree is already officially repopulated
        if (isRunning || !artifactPaths.output || !!session?.repopulatedTree) return;

        let cancelled = false;

        const parseOutputXml = async () => {
            setReparseLoading(true);
            try {
                const result = await parseXmlBackground(artifactPaths.output!);
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
    }, [isRunning, artifactPaths.output, session?.repopulatedTree]);

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
                result = await gemini.summarizeExecution(tree, settings.geminiApiKey, settings.geminiModel || '', language, failureContext, undefined, customPrompt);
            } else if (provider === 'openai') {
                if (!settings.openaiApiKey) throw new Error("Missing OpenAI API Key");
                result = await openai.summarizeExecution(tree, settings.openaiApiKey, settings.openaiModel || '', language, failureContext, undefined, customPrompt);
            } else if (provider === 'claude') {
                if (!settings.claudeApiKey) throw new Error("Missing Claude API Key");
                result = await claude.summarizeExecution(tree, settings.claudeApiKey, settings.claudeModel || '', language, failureContext, undefined, customPrompt);
            }

            setSummary(result);
        } catch (err: any) {
            console.error("Summarization failed:", err);
            setSummaryError(err.message || "Failed to generate summary");
        } finally {
            setIsSummarizing(false);
        }
    };

    // Parse incremental logs
    useEffect(() => {
        // Skip log parsing if we already have a repopped tree and the test is finished
        if (!isRunning && tree.length > 0 && (session?.repopulatedTree || artifactPaths.output)) {
            processedCountRef.current = logs.length; // Mark all as processed
            return;
        }

        const currentCount = logs.length;
        const processedCount = processedCountRef.current;

        // Only clear if it's a fresh run or a reset, not just because component mounted with empty logs while not running
        if (currentCount < processedCount || (isRunning && currentCount === 0)) {
            parsedNodesRef.current = [];
            processedCountRef.current = 0;
            bufferRef.current = [];
            pendingSuiteStartRef.current = false;
            setArtifactPaths({});
            setTree([]);
            return;
        }

        // If nothing new, exit early
        if (currentCount === processedCount) return;

        // Constants
        const IS_DOUBLE = (l: string) => /^={10,}$/.test(l.trim());
        const IS_SINGLE = (l: string) => /^-{10,}$/.test(l.trim());
        const cleanAnsi = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
        const IS_STATUS = (l: string) => / \|\s+(PASS|FAIL)\s+\|/.test(cleanAnsi(l));
        const IS_SUMMARY = (l: string) => /^\d+ tests?, \d+ passed, \d+ failed/.test(l.trim());
        const IS_MAESTRO_VERBOSE = (l: string) => /disableAnsi=false/.test(l) || /\(\[\s*(INFO|DEBUG|ERROR|WARN|TRACE)\s*\]\)/.test(l);
        const IS_SYSTEM = (l: string) => l.trim().startsWith('[System]') || l.trim().startsWith('[Error]') || /^\s*(Output|Log|Report|STDERR|STDOUT):/.test(l) || IS_MAESTRO_VERBOSE(l);
        const IS_MAESTRO_SUITE_START = (l: string) => l.includes("Debug output path:") || l.includes("Waiting for flows to complete...");
        const IS_MAESTRO_SUITE_END = (l: string) => /Flow (Passed|Failed) in/.test(l) || /\d+\/\d+ Flow (Passed|Failed) in/.test(l);
        const IS_MAESTRO_TEST_START = (l: string) => l.includes("Running flow ");
        const IS_MAESTRO_TEST_END = (l: string) => /^\[(Passed|Failed)\]\s+.*\(\d+s\)/.test(l.trim());
        const IS_MAVEN_TEST_START = (l: string) => l.startsWith("[INFO] Running ");
        const IS_MAVEN_TEST_END = (l: string) => l.includes("Tests run: ") && l.includes("Failures: ");
        const IS_ROBOT_RUNNER_TEST_START = (l: string) => l.startsWith("[RobotRunner-Test-Start]") || l.startsWith("[RR-TEST-START]");
        const IS_RR_SUITE_START = (l: string) => l.startsWith("[RR-SUITE-START]");
        const IS_RR_SUITE_END = (l: string) => l.startsWith("[RR-SUITE-END]");
        const IS_RR_TEST_END = (l: string) => l.startsWith("[RR-TEST-END]");
        const IS_REDUNDANT_SYSTEM = (l: string) => l.trim().startsWith('[System]') || /^\s*(Output|Log|Report):/.test(l) || IS_STATUS(l) || l.startsWith("[RR-");

        if (currentCount > processedCount) {
            const newLogs = logs.slice(processedCount);
            const linearNodes = parsedNodesRef.current;

            for (let i = 0; i < newLogs.length; i++) {
                let line = newLogs[i];
                const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim();
                const isSystem = IS_SYSTEM(line);

                const outputMatch = cleanLine.match(/Output:\s+["']?(.*\.xml)["']?/i);
                if (outputMatch) {
                    setArtifactPaths(prev => {
                        const next = { ...prev, output: outputMatch[1].trim() };
                        updateSessionArtifacts(runId, next);
                        return next;
                    });
                }

                const logMatch = cleanLine.match(/Log:\s+["']?(.*\.html)["']?/i);
                if (logMatch) {
                    setArtifactPaths(prev => {
                        const next = { ...prev, log: logMatch[1].trim() };
                        updateSessionArtifacts(runId, next);
                        return next;
                    });
                }

                const reportMatch = cleanLine.match(/Report:\s+["']?(.*\.html)["']?/i);
                if (reportMatch) {
                    setArtifactPaths(prev => {
                        const next = { ...prev, report: reportMatch[1].trim() };
                        updateSessionArtifacts(runId, next);
                        return next;
                    });
                }

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
                } else if (IS_RR_SUITE_START(cleanLine)) {
                    const name = cleanLine.replace("[RR-SUITE-START]", "").trim();
                    const normalizedName = name.split(' :: ')[0].trim();
                    const lastNode = linearNodes[linearNodes.length - 1];
                    // Check if previous node is a heuristic-detected suite-start (Parent.Child) that matches the leaf name (Child)
                    const heuristicLeaf = lastNode?.type === 'suite-start' ? lastNode.name.split('.').pop()?.trim() : null;
                    if (heuristicLeaf === normalizedName) {
                        continue; // Deduplicate
                    }
                    linearNodes.push({ type: 'suite-start', name: normalizedName, originalLine: name, id: `rr-s-start-${processedCount + i}` });
                } else if (IS_RR_SUITE_END(cleanLine)) {
                    const name = cleanLine.replace("[RR-SUITE-END]", "").trim();
                    linearNodes.push({ type: 'suite-end', name: name.split(' :: ')[0], status: 'PASS', summary: '', id: `rr-s-end-${processedCount + i}` });
                } else if (IS_RR_TEST_END(cleanLine)) {
                    const parts = cleanLine.replace("[RR-TEST-END]", "").split(" | ");
                    const name = parts[0].trim();
                    const status = (parts[1] || 'PASS').trim() as 'PASS' | 'FAIL';
                    linearNodes.push({ type: 'text', content: `| ${name} | ${status} |`, isSystem: true, id: `rr-t-end-${processedCount + i}` });
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

        const root: LogNode[] = [];
        const suiteStack: SuiteNode[] = [];
        let currentTest: TestNode | null = null;

        const addToCurrentContext = (node: LogNode) => {
            if (currentTest && node.type === 'text') {
                currentTest.logs.push(node.content);
                return;
            }
            if (suiteStack.length > 0) suiteStack[suiteStack.length - 1].children.push(node);
            else root.push(node);
        };

        const activeSuite = () => suiteStack.length > 0 ? suiteStack[suiteStack.length - 1] : null;

        const closeCurrentTest = () => {
            if (currentTest) {
                const testLogs = currentTest.logs;
                for (let j = testLogs.length - 1; j >= 0; j--) {
                    const cleanLog = cleanAnsi(testLogs[j]);
                    const match = cleanLog.match(/\|\s+(PASS|FAIL)\s+\|/);
                    if (match) {
                        const finalStatus = match[1] as 'PASS' | 'FAIL';
                        currentTest.status = finalStatus;
                        const suite = activeSuite();
                        if (suite && suite.stats) {
                            if (finalStatus === 'PASS') suite.stats.passed++;
                            else if (finalStatus === 'FAIL') {
                                suite.stats.failed++;
                                // Propagate FAIL to all parents in the stack
                                suiteStack.forEach(s => s.status = 'FAIL');
                            }
                        }
                        break;
                    }
                }
                currentTest = null;
            }
        };

        parsedNodesRef.current.forEach((node, idx) => {
            const nodeId = node.id || `node-${processedCountRef.current + idx}`;
            if (node.type === 'suite-start') {
                closeCurrentTest();
                const newSuite: SuiteNode = {
                    type: 'suite',
                    id: nodeId,
                    name: node.name,
                    status: 'RUNNING',
                    summary: '',
                    children: [],
                    stats: { passed: 0, failed: 0, skipped: 0 }
                };
                if (activeSuite()) activeSuite()!.children.push(newSuite);
                else root.push(newSuite);
                suiteStack.push(newSuite);
            } else if (node.type === 'suite-end') {
                closeCurrentTest();
                const targetName = node.name;
                let matchIndex = -1;
                const normalize = (n: string) => n.replace(/\.{2,}$/, '').trim();
                const cleanTarget = normalize(targetName);
                for (let i = suiteStack.length - 1; i >= 0; i--) {
                    const s = suiteStack[i];
                    const cleanStack = normalize(s.name);
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
                    suiteStack.splice(matchIndex);
                }
            } else if (node.type === 'text') {
                const line = node.content;
                if (IS_SINGLE(line) || IS_DOUBLE(line)) {
                    if (currentTest) closeCurrentTest();
                } else if (IS_MAESTRO_TEST_START(line)) {
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
                } else if (IS_MAESTRO_TEST_END(line)) {
                    const status = line.toLowerCase().includes("passed") ? "PASS" : "FAIL";
                    if (currentTest) {
                        currentTest.status = status;
                        currentTest.logs.push(line);
                        const suite = activeSuite();
                        if (suite && suite.stats) {
                            if (status === 'PASS') suite.stats.passed++;
                            else if (status === 'FAIL') suite.stats.failed++;
                        }
                        currentTest = null;
                    } else {
                        const name = line.replace(/^\[(Passed|Failed)\]\s+/, '').replace(/\s+\(\d+s\)$/, '').trim();
                        const instantTest: TestNode = {
                            type: 'test',
                            name,
                            status,
                            logs: [line],
                            id: `m-instant-${processedCountRef.current + idx}`
                        };
                        const suite = activeSuite();
                        if (suite && suite.stats) {
                            if (status === 'PASS') suite.stats.passed++;
                            else if (status === 'FAIL') suite.stats.failed++;
                        }
                        if (activeSuite()) activeSuite()!.children.push(instantTest);
                        else root.push(instantTest);
                    }
                } else if (IS_MAVEN_TEST_START(line)) {
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
                } else if (IS_MAVEN_TEST_END(line)) {
                    if (currentTest) {
                        const isFailed = line.includes("Failures: 0") && line.includes("Errors: 0") ? false : true;
                        currentTest.status = isFailed ? "FAIL" : "PASS";
                        currentTest.logs.push(line);
                        currentTest = null;
                    } else {
                        addToCurrentContext({ type: 'text', content: line, id: nodeId });
                    }
                } else {
                    const isSys = node.isSystem;
                    if (isSys) {
                        if (currentTest) {
                            if (!IS_REDUNDANT_SYSTEM(line)) currentTest.logs.push(line);
                            if (line.includes('[System] Finished:') || line.includes('[System] Stopping...') || line.includes('[System] Toolbox session stopped')) {
                                const isSuccess = line.toLowerCase().includes('exit code: 0');
                                const finalStatus = isSuccess ? 'PASS' : 'FAIL';
                                if (currentTest.status === 'RUNNING') {
                                    currentTest.status = finalStatus;
                                    const suite = suiteStack[suiteStack.length - 1];
                                    if (suite && suite.stats) {
                                        if (finalStatus === 'PASS') suite.stats.passed++;
                                        else if (finalStatus === 'FAIL') suite.stats.failed++;
                                    }
                                }
                                currentTest = null;
                                suiteStack.forEach(s => { if (s.status === 'RUNNING') s.status = finalStatus; });
                            }
                        } else {
                            if (!IS_REDUNDANT_SYSTEM(line)) addToCurrentContext({ type: 'text', content: line, id: nodeId });
                            if (line.includes('[System] Finished:') || line.includes('[System] Stopping...') || line.includes('[System] Toolbox session stopped')) {
                                const isSuccess = line.toLowerCase().includes('exit code: 0');
                                const finalStatus = isSuccess ? 'PASS' : 'FAIL';
                                suiteStack.forEach(s => { if (s.status === 'RUNNING') s.status = finalStatus; });
                            }
                        }
                    } else {
                        if (currentTest) {
                            const isMarker = IS_ROBOT_RUNNER_TEST_START(line);
                            const cleanLineText = cleanAnsi(line);
                            const nameOnly = cleanLineText.trim().split(' :: ')[0].trim();
                            const isTestNameLine = nameOnly === currentTest.name || cleanLineText.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/)?.[1].trim() === currentTest.name;
                            if (!isMarker && !isTestNameLine) currentTest.logs.push(line);
                        } else {
                            if (IS_ROBOT_RUNNER_TEST_START(line)) {
                                const rawName = line.replace("[RR-TEST-START]", "").replace("[RobotRunner-Test-Start]", "").trim();
                                const name = rawName.split(' :: ')[0].trim();

                                // Check if a test was already started by heuristic-matching just before
                                const suiteChildren = activeSuite()?.children;
                                const lastAdded = suiteChildren?.[suiteChildren.length - 1];
                                const testLeaf = lastAdded?.type === 'test' ? lastAdded.name.split('.').pop()?.trim() : null;
                                if (testLeaf === name) {
                                    currentTest = lastAdded as TestNode; // Link to the already-started test node
                                    return;
                                }

                                const newTest: TestNode = {
                                    type: 'test',
                                    name: name,
                                    status: 'RUNNING',
                                    logs: [],
                                    id: `test-started-${nodeId}`
                                };
                                if (activeSuite()) activeSuite()!.children.push(newTest);
                                else root.push(newTest);
                                currentTest = newTest;
                            } else {
                                const isMaestroSuite = activeSuite()?.name.includes('Maestro');
                                if (line.trim().length > 0 && !isMaestroSuite && !line.includes('[RobotRunner-Test-Start]') && !line.includes('[RR-TEST-START]') && !IS_STATUS(line)) {
                                    let name = line.trim();
                                    if (name.includes(' :: ')) name = name.split(' :: ')[0].trim();
                                    const statusMatch = name.match(/^(.*?)\s*\|\s+(PASS|FAIL)\s+\|\s*$/);
                                    if (statusMatch) name = statusMatch[1].trim();
                                    const newTest: TestNode = {
                                        type: 'test',
                                        name: name,
                                        status: 'RUNNING',
                                        logs: [line],
                                        id: `test-${nodeId}`
                                    };
                                    if (activeSuite()) activeSuite()!.children.push(newTest);
                                    else root.push(newTest);
                                    currentTest = newTest;
                                } else {
                                    if (!IS_REDUNDANT_SYSTEM(line)) addToCurrentContext({ type: 'text', content: line, id: nodeId });
                                }
                            }
                        }
                    }
                }
            }
        });

        setTree(root);
    }, [logs]);

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
                        <div className="h-4 w-px bg-outline-variant/30 mx-1" />
                    )}
                    {!isRunning && tree.length > 0 && (
                        <AiButton
                            id="run_summary"
                            isLoading={isSummarizing}
                            onClick={(_e, customPrompt) => handleSummarize(customPrompt)}
                            label={t('run_tab.console.summarize_run')}
                            variant="primary"
                            className="h-6"
                        />
                    )}
                </div>
            </div>

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

            <div className="flex-1 min-h-0 flex flex-col relative">
                <div
                    ref={containerRef}
                    onScroll={!isRawMode ? onScroll : undefined}
                    className={clsx(
                        "h-full flex-1 min-h-0 flex flex-col bg-surface overflow-y-auto font-mono text-xs custom-scrollbar relative",
                        !isRawMode && "p-4"
                    )}
                >
                    {logs.length === 0 && (
                        <div className="text-on-surface-variant/80 italic opacity-50 select-none pb-4 p-4">{t('run_tab.console.waiting')}</div>
                    )}
                    {isRawMode ? (
                        <Virtuoso
                            ref={virtuosoRef}
                            data={logs}
                            followOutput={stickToBottom}
                            atBottomStateChange={setStickToBottom}
                            className="flex-1 w-full"
                            style={{ height: '100%', minWidth: '100%' }}
                            itemContent={(index, line) => (
                                <div key={index} className="min-h-[1.2em] px-4 whitespace-pre-wrap font-mono text-xs text-on-surface/50 leading-tight border-l-2 border-transparent hover:border-primary/20 hover:bg-primary/5 transition-colors">
                                    {index} {line}
                                </div>
                            )}
                        />
                    ) : (
                        <div className="relative z-10 w-full mb-8">
                            {(summary || isSummarizing || summaryError) && (
                                <div className="mt-4 mb-8 border-b border-outline-variant/20 pb-6">
                                    <AiResponse
                                        title={t('run_tab.console.summary_title')}
                                        isLoading={isSummarizing}
                                        rationaleHeader={t('run_tab.console.summary_rationale')}
                                        rationale={summary}
                                        error={summaryError}
                                        onCopy={() => { }}
                                    />
                                </div>
                            )}
                            {!isRawMode && visibleNodes.length > 0 && (
                                <div className="flex-1 min-h-0">
                                    <Virtuoso
                                        style={{ height: '100%', minHeight: '400px' }}
                                        data={visibleNodes}
                                        useWindowScroll={false}
                                        customScrollParent={containerRef.current || undefined}
                                        itemContent={(_index, item) => (
                                            <div style={{ paddingLeft: item.depth * 16 }} key={item.id} className="py-0.5">
                                                <LogTree 
                                                    node={item.node} 
                                                    depth={item.depth}
                                                    dbPath={session?.parsedDbPath} 
                                                    parentType={item.parentType as any}
                                                    isFlatRow={true}
                                                    isExpanded={expandedIds.has(item.id)}
                                                    isLast={item.isLast}
                                                    onToggleExpand={handleToggleExpand}
                                                    onChildrenLoaded={handleChildrenLoaded}
                                                />
                                            </div>
                                        )}
                                    />
                                </div>
                            )}
                            {(!isRawMode && visibleNodes.length === 0 && tree.length > 0) && (
                                tree.map(node => <LogTree key={node.id} node={node} dbPath={session?.parsedDbPath} />)
                            )}
                            {(isRunning || session?.status === 'stopping') && (
                                <div className="text-primary dark:text-primary/80 mt-4 flex items-center gap-2 text-sm italic opacity-70 animate-pulse ml-2">
                                    <ExpressiveLoading size="sm" variant="circular" />
                                    {session?.status === 'stopping'
                                        ? t('run_tab.console.stopping', "Generating reports...")
                                        : t('run_tab.console.processing', "Processing...")}
                                </div>
                            )}
                            {!isRunning && reparseLoading && (
                                <div className="text-primary/60 mt-4 flex items-center gap-2 text-xs italic opacity-60 animate-pulse ml-2">
                                    <ExpressiveLoading size="sm" variant="circular" />
                                    {t('run_tab.console.loading_xml')}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {showDebugConsole && !isRawMode && (
                    <div className="h-40 border-t border-outline-variant/30 bg-surface-variant/5 flex flex-col shrink-0 overflow-hidden">
                        <div className="px-3 py-1 bg-surface-variant/20 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-on-surface-variant/60 tracking-wider">DEBUG CONSOLE</span>
                            <button onClick={() => setShowDebugConsole(false)} className="text-on-surface-variant/60 hover:text-on-surface transition-colors">
                                <X size={12} />
                            </button>
                        </div>
                        <div
                            className="flex-1 overflow-hidden font-mono text-[10px] text-on-surface-variant/70 leading-tight select-text"
                        >
                            <Virtuoso
                                ref={debugVirtuosoRef}
                                data={logs}
                                followOutput={stickToBottom}
                                atBottomStateChange={setStickToBottom}
                                style={{ height: '100%' }}
                                className="custom-scrollbar"
                                itemContent={(index, line) => (
                                    <div key={index} className="px-3 whitespace-pre-wrap break-all opacity-80 hover:opacity-100 transition-opacity hover:bg-surface-variant/10">
                                        {index} {line}
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default RunConsole;
