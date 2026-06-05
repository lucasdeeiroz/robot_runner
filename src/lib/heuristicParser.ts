import { LinearNode, LogNode, SuiteNode, TestNode, TextNode } from "./robotParser";

export interface HeuristicParserResult {
    tree: LogNode[];
    parsedNodes: LinearNode[];
    processedCount: number;
    outputXmlPath?: string;
    outputDir?: string;
}

const IS_DOUBLE = (l: string) => /^={10,}$/.test(l.trim());
const IS_SINGLE = (l: string) => /^-{10,}$/.test(l.trim());
const cleanAnsi = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');

const IS_STATUS = (line: string) => {
    const clean = cleanAnsi(line).trim();
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
    const match = raw.match(/^(.+?)\s?::\s*(.*)$/);
    if (match) {
        return {
            name: match[1].trim(),
            doc: match[2].trim() || undefined
        };
    }
    return { name: raw.trim(), doc: undefined };
};

/**
 * Parses raw logs incrementally to build a heuristic tree representation of the test execution.
 */
export function parseHeuristicLogs(
    logs: string[],
    prevParsedNodes: LinearNode[],
    processedCount: number
): HeuristicParserResult {
    const newLogs = logs.slice(processedCount);
    const linearNodes = [...prevParsedNodes];
    let outputXmlPath: string | undefined;
    let outputDir: string | undefined;

    for (let i = 0; i < newLogs.length; i++) {
        let line = newLogs[i];
        const cleanLine = cleanAnsi(line).trim();
        const isSystem = IS_SYSTEM(line);

        // Detect Output XML
        if (isSystem) {
            const detectedPath = extractOutputXmlPath(line);
            if (detectedPath) {
                outputXmlPath = detectedPath;
                outputDir = getDirectoryFromFilePath(detectedPath);
                if (outputDir && outputDir.toLowerCase().endsWith('.xml')) {
                    outputDir = getDirectoryFromFilePath(outputDir);
                }
            }
        }

        if (IS_MAESTRO_VERBOSE(line)) {
            line = line.replace(/.*disableAnsi=false.*?\]\)\s*/, '').trim();
        }

        if (!line) continue;

        const nodeIdx = processedCount + i;

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
                linearNodes.push({ type: 'suite-start', name, doc, originalLine: suiteLine, id: `suite-start-${nodeIdx}` });
                continue;
            }

            if (last?.type === 'text' && !IS_SYSTEM(last.content)) {
                const prevNode = linearNodes[linearNodes.length - 2];
                const isPrevSingle = prevNode?.type === 'text' && IS_SINGLE(prevNode.content);
                if (isPrevSingle) {
                    const suiteLine = last.content.trim();
                    const { name, doc } = splitNameAndDoc(suiteLine);
                    linearNodes.pop();
                    linearNodes.pop();
                    linearNodes.push({ type: 'suite-start', name, doc, originalLine: suiteLine, id: `sub-suite-start-${nodeIdx}` });
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
                        const match = node.content.match(/^(.*?)\s*\|\s+(PASS|FAIL|SKIP)\s+\|\s*$/);
                        if (match) statusNodeIndex = linearNodes.length - 1 - k;
                        break;
                    }
                }
                if (statusNodeIndex !== -1) {
                    const statusNode = linearNodes[statusNodeIndex] as TextNode;
                    const match = statusNode.content.match(/^(.*?)\s*\|\s+(PASS|FAIL|SKIP)\s+\|\s*$/);
                    if (match) {
                        const name = match[1].trim();
                        const status = match[2] as 'PASS' | 'FAIL' | 'SKIP';
                        linearNodes.splice(statusNodeIndex);
                        const { name: finalName, doc } = splitNameAndDoc(name);
                        linearNodes.push({ type: 'suite-end', name: finalName, status, doc, summary: summaryLine, id: `suite-end-${nodeIdx}` });
                        continue;
                    }
                }
            }
            linearNodes.push({ type: 'text', content: line, isSystem, id: `div-${nodeIdx}` });
        } else if (IS_ROBOT_RUNNER_TEST_START(cleanLine)) {
            const raw = cleanLine.replace(/^\[(RobotRunner-Test-Start|RR-TEST-START)\]/, "").trim();
            const { name, doc } = splitNameAndDoc(raw);
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
            linearNodes.push({ type: 'test-start', name, doc, originalLine: raw, id: `rr-t-start-${nodeIdx}` });
        } else if (IS_RR_SUITE_START(cleanLine)) {
            const raw = cleanLine.replace("[RR-SUITE-START]", "").trim();
            const { name, doc } = splitNameAndDoc(raw);
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
            linearNodes.push({ type: 'suite-start', name, doc, originalLine: raw, id: `rr-s-start-${nodeIdx}` });
        } else if (IS_RR_SUITE_END(cleanLine)) {
            const raw = cleanLine.replace("[RR-SUITE-END]", "").trim();
            const parts = raw.split(" | ");
            const { name, doc } = splitNameAndDoc(parts[0]);
            const status = (parts[1] || 'PASS').trim() as 'PASS' | 'FAIL' | 'SKIP';
            linearNodes.push({ type: 'suite-end', name, doc, status, summary: '', id: `rr-s-end-${nodeIdx}` });
        } else if (IS_RR_TEST_END(cleanLine)) {
            const parts = cleanLine.replace("[RR-TEST-END]", "").split(" | ");
            const { name, doc } = splitNameAndDoc(parts[0]);
            const status = (parts[1] || 'PASS').trim() as 'PASS' | 'FAIL' | 'SKIP';
            const ret = parts[2]?.trim();
            linearNodes.push({ type: 'test-end', name, doc, status, ret, id: `rr-t-end-${nodeIdx}` });
        } else if (IS_MAESTRO_SUITE_START(line)) {
            linearNodes.push({ type: 'suite-start', name: 'Maestro Suite', originalLine: line, id: `m-suite-start-${nodeIdx}` });
        } else if (IS_MAESTRO_SUITE_END(line)) {
            const status = line.includes("Passed") ? "PASS" : "FAIL";
            linearNodes.push({ type: 'suite-end', name: 'Maestro Suite', status, summary: line, id: `m-suite-end-${nodeIdx}` });
        } else if (IS_MAESTRO_TEST_START(line)) {
            const name = line.replace(/.*Running flow\s+/, '').trim();
            linearNodes.push({ type: 'test-start', name, originalLine: line, id: `m-t-start-${nodeIdx}` });
        } else if (IS_MAESTRO_TEST_END(line)) {
            const status = line.toLowerCase().includes("passed") ? "PASS" : "FAIL";
            const name = line.replace(/^\[(Passed|Failed)\]\s+/, '').replace(/\s+\(\d+s\)$/, '').trim();
            linearNodes.push({ type: 'test-end', name, status, id: `m-t-end-${nodeIdx}` });
        } else if (IS_MAVEN_TEST_START(line)) {
            const name = line.replace("[INFO] Running ", "").trim();
            linearNodes.push({ type: 'test-start', name, originalLine: line, id: `mvn-t-start-${nodeIdx}` });
        } else if (IS_MAVEN_TEST_END(line)) {
            const isFailed = !(line.includes("Failures: 0") && line.includes("Errors: 0"));
            const status = isFailed ? "FAIL" : "PASS";
            linearNodes.push({ type: 'test-end', name: 'Maven Test', status, id: `mvn-t-end-${nodeIdx}` });
        } else if (line.startsWith('[AI Agent] Thought:')) {
            linearNodes.push({ type: 'ai-thought', content: line.replace('[AI Agent] Thought:', '').trim(), id: `ai-thought-${nodeIdx}` } as any);
        } else if (line.startsWith('[AI Agent] Action:')) {
            linearNodes.push({ type: 'ai-action', content: line.replace('[AI Agent] Action:', '').trim(), id: `ai-action-${nodeIdx}` } as any);
        } else if (line.startsWith('[ADB] Executed:')) {
            linearNodes.push({ type: 'adb-executed', content: line.replace('[ADB] Executed:', '').trim(), id: `adb-executed-${nodeIdx}` } as any);
        } else {
            linearNodes.push({ type: 'text', content: line, isSystem, id: `txt-${nodeIdx}` });
        }
    }

    // Convert Linear Nodes to Tree
    const root: LogNode[] = [];
    const suiteStack: SuiteNode[] = [];
    let currentTest: TestNode | null = null;

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
                            suiteStack.forEach(s => s.status = 'FAIL');
                        }
                    }
                    break;
                }
            }
            currentTest = null;
        }
    };

    linearNodes.forEach((node, idx) => {
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
        } else if (node.type === 'test-start') {
            closeCurrentTest();
            currentTest = {
                type: 'test',
                name: node.name,
                doc: node.doc,
                status: 'RUNNING',
                logs: [],
                id: nodeId
            };
            if (activeSuite()) activeSuite()!.children.push(currentTest);
            else root.push(currentTest);
        } else if (node.type === 'test-end') {
            // Find current test by name if stack is messed up
            if (!currentTest || (node.name !== 'Maven Test' && currentTest.name !== node.name)) {
                // Heuristic fix: if we get a test-end but currentTest name doesn't match, 
                // we might have missed a test-start or it's a generic one
            }
            
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
            if (currentTest) {
                if (!IS_REDUNDANT_SYSTEM(node.content)) currentTest.logs.push(node.content);
                // System finish detection
                if (node.content.includes('[System] Finished:') || node.content.includes('[System] Stopping...')) {
                    const isSuccess = node.content.toLowerCase().includes('exit code: 0');
                    const finalStatus = isSuccess ? 'PASS' : 'FAIL';
                    if (currentTest.status === 'RUNNING') {
                        currentTest.status = finalStatus;
                        const suite = activeSuite();
                        if (suite && suite.stats) {
                            if (finalStatus === 'PASS') suite.stats.passed++;
                            else if (finalStatus === 'FAIL') suite.stats.failed++;
                        }
                    }
                    currentTest = null;
                    suiteStack.forEach(s => { if (s.status === 'RUNNING') s.status = finalStatus; });
                }
            } else {
                const currentSuite = activeSuite();
                if (currentSuite) {
                    if (!IS_REDUNDANT_SYSTEM(node.content)) {
                        currentSuite.children.push({ type: 'text', content: node.content, id: nodeId });
                    }
                } else {
                    if (!IS_REDUNDANT_SYSTEM(node.content)) {
                        root.push({ type: 'text', content: node.content, id: nodeId });
                    }
                }
            }
        } else if (node.type === 'ai-thought' || node.type === 'ai-action' || node.type === 'adb-executed') {
            const aiNode = { ...node, id: nodeId } as any;
            if (currentTest) {
                if (!(currentTest as any).children) (currentTest as any).children = [];
                (currentTest as any).children.push(aiNode);
            } else {
                const currentSuite = activeSuite();
                if (currentSuite) {
                    currentSuite.children.push(aiNode);
                } else {
                    root.push(aiNode);
                }
            }
        }
    });

    return {
        tree: root,
        parsedNodes: linearNodes,
        processedCount: logs.length,
        outputXmlPath,
        outputDir
    };
}
