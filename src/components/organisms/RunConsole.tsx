import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Star, Eye, EyeOff, Terminal, X, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { parseXmlBackground } from "@/lib/xmlParseCache";
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
import { useCallback } from "react";

interface RunConsoleProps {
    runId: string;
    logs: string[];
    isSessionRunning?: boolean;
    testPath?: string;
}

export function RunConsole({ runId, logs, isSessionRunning: isRunning, testPath }: RunConsoleProps) {
    const { t, i18n } = useTranslation();
    const { sessions, setSessionTree } = useTestSessions();
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
    }, [session?.repopulatedTree]);

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
        if (isRunning || !session?.outputDir || !!session?.repopulatedTree) return;

        let cancelled = false;

        const parseOutputXml = async () => {
            setReparseLoading(true);
            try {
                // Try to find the detected output XML from logs first, then fallback to output.xml
                const outputPath = session.outputDir!;
                const outputXmlPath = session.outputXmlPath || `${outputPath.replace(/[\\/]+$/, "")}/output.xml`;
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
        if (!isRunning && tree.length > 0 && (session?.repopulatedTree || session?.outputDir)) {
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
            setTree([]);
            return;
        }

        // If nothing new, exit early
        if (currentCount === processedCount) return;

        // Constants
        const IS_DOUBLE = (l: string) => /^={10,}$/.test(l.trim());
        const IS_SINGLE = (l: string) => /^-{10,}$/.test(l.trim());
        const cleanAnsi = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
        const IS_STATUS = (line: string) => {
            const clean = cleanAnsi(line).trim();
            // Match | PASS | or | FAIL | or | SKIP | with any amount of padding/content
            return /\|\s+(PASS|FAIL|SKIP)\s+\|/.test(clean);
        };
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

        const extractOutputXmlPath = (l: string): string | undefined => {
            const clean = cleanAnsi(l).trim();
            const match = clean.match(/^\s*Output:\s*["']?(.+?\.xml)\b["']?(?:\s+.*)?$/i);
            return match?.[1]?.trim();
        };

        const getDirectoryFromFilePath = (filePath: string): string | undefined => {
            const normalized = filePath.trim().replace(/[\\/]+$/, "");
            const lastSeparator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
            if (lastSeparator <= 0) {
                return lastSeparator === 0 ? normalized.slice(0, 1) : undefined;
            }
            return normalized.slice(0, lastSeparator);
        };

        const splitNameAndDoc = (raw: string) => {
            // Handle both "Name :: Doc" and "Name::Doc" or "Name ::"
            const match = raw.match(/^(.+?)\s?::\s*(.*)$/);
            if (match) {
                return {
                    name: match[1].trim(),
                    doc: match[2].trim() || undefined
                };
            }
            return { name: raw.trim(), doc: undefined };
        };

        // Helper to detect output XML from logs
        const detectOutputXml = (l: string) => {
            const outputXmlPath = extractOutputXmlPath(l);
            if (!outputXmlPath) {
                return;
            }

            let outputDir = getDirectoryFromFilePath(outputXmlPath);
            
            // If outputDir is empty or same as file (edge cases), use parent
            if (outputDir && outputDir.toLowerCase().endsWith('.xml')) {
                outputDir = getDirectoryFromFilePath(outputDir);
            }

            // Save both separately: the XML file for parsing, and its directory for the 'Open Folder' button
            setSessionTree(runId, undefined, undefined, outputDir, outputXmlPath);
        };

        if (currentCount > processedCount) {
            const newLogs = logs.slice(processedCount);
            const linearNodes = parsedNodesRef.current;

            for (let i = 0; i < newLogs.length; i++) {
                let line = newLogs[i];
                const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim();
                const isSystem = IS_SYSTEM(line);

                if (isSystem) detectOutputXml(line);


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
                        const suiteLine = last.content.trim();
                        const { name, doc } = splitNameAndDoc(suiteLine);
                        linearNodes.pop();
                        if (isPrevDouble) linearNodes.pop();
                        linearNodes.push({ type: 'suite-start', name, doc, originalLine: suiteLine, id: `suite-start-${processedCount + i}` });
                        continue;
                    }

                    // Heuristic: If we see a DOUBLE line and the last node was a TEXT that looks like a sub-suite (often preceded by SINGLE line)
                    if (last?.type === 'text' && !IS_SYSTEM(last.content)) {
                        const prevNode = linearNodes[linearNodes.length - 2];
                        const isPrevSingle = prevNode?.type === 'text' && IS_SINGLE(prevNode.content);
                        if (isPrevSingle) {
                            const suiteLine = last.content.trim();
                            const { name, doc } = splitNameAndDoc(suiteLine);
                            
                            linearNodes.pop();
                            linearNodes.pop();
                            linearNodes.push({ 
                                type: 'suite-start', 
                                name: name, 
                                doc,
                                originalLine: suiteLine, 
                                id: `sub-suite-start-${processedCount + i}` 
                            });
                            continue;
                        }
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
                                const { name: finalName, doc } = splitNameAndDoc(name);
                                linearNodes.push({ type: 'suite-end', name: finalName, status, doc, summary: summaryLine, id: `suite-end-${processedCount + i}` });
                                continue;
                            }
                        }
                    }
                    linearNodes.push({ type: 'text', content: line, isSystem, id: `div-${processedCount + i}` });
                } else if (IS_ROBOT_RUNNER_TEST_START(cleanLine)) {
                    const raw = cleanLine.replace(/^\[(RobotRunner-Test-Start|RR-TEST-START)\]/, "").trim();
                    const { name, doc } = splitNameAndDoc(raw);

                    // Deduplicate against heuristic test detection (the test name line with spaces)
                    let lastTest: any = null;
                    for (let j = linearNodes.length - 1; j >= 0; j--) {
                        if (linearNodes[j].type === 'test-start') {
                            lastTest = linearNodes[j];
                            break;
                        }
                    }

                    if (lastTest && lastTest.name.trim() === name) {
                        if (doc) lastTest.doc = doc;
                        continue;
                    }

                    linearNodes.push({ type: 'test-start', name, doc, originalLine: raw, id: `rr-t-start-${processedCount + i}` });
                } else if (IS_RR_SUITE_START(cleanLine)) {
                    const raw = cleanLine.replace("[RR-SUITE-START]", "").trim();
                    const { name, doc } = splitNameAndDoc(raw);
                    // Deduplicate: check if this suite was already added by the standard output parser
                    // Look back through recent nodes to find a matching suite-start
                    let alreadyExists = false;
                    for (let j = linearNodes.length - 1; j >= Math.max(0, linearNodes.length - 10); j--) {
                        const node = linearNodes[j];
                        if (node.type === 'suite-start') {
                            const nodeLeaf = node.name.split('.').pop()?.trim();
                            if (nodeLeaf === name) {
                                if (doc && !node.doc) node.doc = doc;
                                alreadyExists = true;
                                break;
                            }
                        }
                    }

                    if (alreadyExists) continue;
                    linearNodes.push({ type: 'suite-start', name, doc, originalLine: raw, id: `rr-s-start-${processedCount + i}` });
                } else if (IS_RR_SUITE_END(cleanLine)) {
                    const raw = cleanLine.replace("[RR-SUITE-END]", "").trim();
                    const parts = raw.split(" | ");
                    const { name, doc } = splitNameAndDoc(parts[0]);
                    const status = (parts[1] || 'PASS').trim() as 'PASS' | 'FAIL' | 'SKIP';
                    linearNodes.push({ type: 'suite-end', name, doc, status: status, summary: '', id: `rr-s-end-${processedCount + i}` });
                } else if (IS_RR_TEST_END(cleanLine)) {
                    const parts = cleanLine.replace("[RR-TEST-END]", "").split(" | ");
                    const { name, doc } = splitNameAndDoc(parts[0]);
                    const status = (parts[1] || 'PASS').trim() as 'PASS' | 'FAIL' | 'SKIP';
                    const ret = parts[2]?.trim();
                    linearNodes.push({ type: 'test-end', name, doc, status, ret, id: `rr-t-end-${processedCount + i}` });
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
                    const match = cleanLog.match(/\|\s+(PASS|FAIL|SKIP)\s+\|/);
                    if (match) {
                        const finalStatus = match[1] as 'PASS' | 'FAIL' | 'SKIP';
                        currentTest.status = finalStatus;
                        const suite = activeSuite();
                        if (suite && suite.stats) {
                            if (finalStatus === 'PASS') suite.stats.passed++;
                            else if (finalStatus === 'SKIP') suite.stats.skipped++;
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
            const nodeId = node.id || `node-${idx}`;
            if (node.type === 'suite-start') {
                closeCurrentTest();
                const newSuite: SuiteNode = {
                    type: 'suite',
                    id: nodeId,
                    name: node.name,
                    doc: node.doc,
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
                    // Match exactly or check if it's the leaf name of a dotted path
                    if (cleanStack === cleanTarget || cleanStack.endsWith('.' + cleanTarget) || cleanStack === cleanTarget.split('.').pop()) {
                        matchIndex = i;
                        break;
                    }
                }
                if (matchIndex !== -1) {
                    const suite = suiteStack[matchIndex];
                    suite.status = node.status;
                    suite.summary = node.summary;
                    if ((node as any).doc) suite.doc = (node as any).doc;
                    suiteStack.splice(matchIndex);
                }
            } else if (node.type === 'test-end') {
                if (currentTest) {
                    currentTest.status = node.status;
                    if (node.doc) currentTest.doc = node.doc;
                    if (node.ret) currentTest.ret = node.ret;
                    const suite = activeSuite();
                    if (suite && suite.stats) {
                        if (node.status === 'PASS') suite.stats.passed++;
                        else if (node.status === 'SKIP') suite.stats.skipped++;
                        else if (node.status === 'FAIL') {
                            suite.stats.failed++;
                            suiteStack.forEach(s => s.status = 'FAIL');
                        }
                    }
                    currentTest = null;
                }
            } else if (node.type === 'text') {
                const line = node.content;
                if (IS_SINGLE(line) || IS_DOUBLE(line)) {
                    // Do NOT close test on separators. They are often part of the test output.
                    if (currentTest) {
                        currentTest.logs.push(line);
                    } else {
                        addToCurrentContext({ type: 'text', content: line, id: nodeId });
                    }
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
                            const statusMatch = cleanLineText.match(/^(.*?)\s*\|\s+(PASS|FAIL|SKIP)\s+\|/);
                            const isStatusLine = !!statusMatch;

                            if (isStatusLine && statusMatch) {
                                const status = statusMatch[2] as 'PASS' | 'FAIL' | 'SKIP';
                                currentTest.status = status;
                                // Propagate to suites
                                if (status === 'FAIL') {
                                    suiteStack.forEach(s => s.status = 'FAIL');
                                    const suite = activeSuite();
                                    if (suite && suite.stats) suite.stats.failed++;
                                } else if (status === 'PASS') {
                                    const suite = activeSuite();
                                    if (suite && suite.stats) suite.stats.passed++;
                                } else if (status === 'SKIP') {
                                    const suite = activeSuite();
                                    if (suite && suite.stats) suite.stats.skipped++;
                                }
                            }

                            const { name: nameOnly } = splitNameAndDoc(cleanLineText);
                            const isTestNameLine = nameOnly === currentTest.name || (statusMatch?.[1].trim() === currentTest.name);
                            if (!isMarker && !isTestNameLine) currentTest.logs.push(line);
                        } else {
                            if (IS_ROBOT_RUNNER_TEST_START(line)) {
                                const rawName = line.replace("[RR-TEST-START]", "").replace("[RobotRunner-Test-Start]", "").trim();
                                const { name, doc } = splitNameAndDoc(rawName);

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
                                    doc: doc,
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
                                    const { name, doc } = splitNameAndDoc(line);
                                    const statusMatch = cleanAnsi(name).match(/^(.*?)\s*\|\s+(PASS|FAIL|SKIP)\s+\|/);
                                    if (statusMatch) {
                                        // It's a status line. Try to apply it to the last test instead of starting a new one.
                                        const actualName = statusMatch[1].trim();
                                        const suite = activeSuite();
                                        if (suite) {
                                            const lastNode = suite.children[suite.children.length - 1];
                                            if (lastNode?.type === 'test' && (lastNode.name === actualName || actualName.endsWith('.' + lastNode.name))) {
                                                const status = statusMatch[2] as any;
                                                lastNode.status = status;
                                                lastNode.logs.push(line);
                                                if (status === 'FAIL') suiteStack.forEach(s => s.status = 'FAIL');
                                                return;
                                            }
                                        }
                                        // Fallback: don't create a new test for a status line if it's orphaned
                                        addToCurrentContext({ type: 'text', content: line, id: nodeId });
                                        return;
                                    }

                                    // Conservative heuristic: only start a new test if the line doesn't look like a log/status line
                                    // Also check for common error prefixes and length
                                    const isLikelyLog = name.startsWith('|') || 
                                                       name.startsWith('...') || 
                                                       name.startsWith('Arguments:') ||
                                                       name.startsWith('Traceback') ||
                                                       name.startsWith('TypeError') ||
                                                       name.length > 100 ||
                                                       name.includes('did not appear in');
                                    
                                    if (isLikelyLog) {
                                        addToCurrentContext({ type: 'text', content: line, id: nodeId });
                                        return;
                                    }

                                    const newTest: TestNode = {
                                        type: 'test',
                                        name: name,
                                        doc,
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
                </div>
            </div>

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
                            {!isRawMode && tree.length > 0 && (
                                <div className="flex-1 min-h-0 space-y-2">
                                    {tree.map((node) => (
                                        <LogTree
                                            key={node.id}
                                            node={node}
                                            depth={0}
                                            dbPath={session?.parsedDbPath}
                                            onToggleExpand={handleToggleExpand}
                                            isExpanded={expandedIds.has(node.id)}
                                            onChildrenLoaded={handleChildrenLoaded}
                                        />
                                    ))}
                                </div>
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
