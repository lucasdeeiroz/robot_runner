import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, MinusCircle, Layers, Star, ExternalLink, FileOutput, Image as ImageIcon, BugPlay, CirclePlay, Repeat, IterationCcw, Workflow, Infinity, Split, StepForward, CalendarCog } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { XMLParser } from "fast-xml-parser";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/atoms/Button";

interface RunConsoleProps {
    logs: string[];
    isSessionRunning?: boolean;
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
    children?: LogNode[];
    duration?: string;
    failureDetail?: {
        message: string;
        screenshot?: string;
    };
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
    duration?: string;
    children: LogNode[];
}

type KeywordSubType = 'keyword' | 'setup' | 'teardown' | 'for' | 'iteration' | 'if' | 'else-if' | 'else' | 'break' | 'continue' | 'while';

interface KeywordNode {
    type: 'keyword';
    subType?: KeywordSubType;
    id: string;
    name: string;
    library?: string;
    status: 'PASS' | 'FAIL' | 'NOT_RUN' | 'RUNNING';
    duration?: string;
    args?: string[];
    screenshot?: string;
    children: LogNode[];
}

type LogNode = TextNode | SuiteStartNode | TestNode | SuiteNode | SuiteEndNode | KeywordNode;
type LinearNode = TextNode | SuiteStartNode | SuiteEndNode;

const formatRobotDuration = (start: string, end: string): string => {
    if (!start || !end) return "";
    // Robot timestamp: 20260318 15:15:00.000
    const parse = (ts: string) => {
        if (!ts) return null;
        const parts = ts.match(/(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (parts) {
            return new Date(
                parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]),
                parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6]), parseInt(parts[7])
            ).getTime();
        }
        const d = new Date(ts).getTime();
        return isNaN(d) ? null : d;
    };

    const s = parse(start);
    const e = parse(end);
    if (s === null || e === null) return "";

    const diff = e - s;
    const ms = diff % 1000;
    const secs = Math.floor(diff / 1000) % 60;
    const mins = Math.floor(diff / (1000 * 60)) % 60;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    const pad = (n: number, z = 2) => n.toString().padStart(z, '0');
    return `${hours > 0 ? pad(hours) + ':' : ''}${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
};

// RF5+ elapsed is a float of total seconds: "68.326466" → "01:08.326"
const formatElapsedSeconds = (raw: string): string => {
    const total = parseFloat(raw);
    if (isNaN(total) || total < 0) return '';
    const pad = (n: number, z = 2) => n.toString().padStart(z, '0');
    const ms = Math.round((total % 1) * 1000);
    const secs = Math.floor(total) % 60;
    const mins = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return `${hours > 0 ? pad(hours) + ':' : ''}${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
};


import { LinkRenderer } from "../molecules/LinkRenderer";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

export function RunConsole({ logs, isSessionRunning: isRunning, testPath }: RunConsoleProps) {
    const { t } = useTranslation();
    const [isRawMode, setIsRawMode] = useState(false);


    // State for toggles (Set of IDs)
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
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

                const details: Record<string, { message: string, screenshot?: string, name: string }> = {};

                // Utility — resolve screenshot src to base64
                const resolveScreenshot = async (src: string | undefined): Promise<string | undefined> => {
                    if (!src) return undefined;
                    if (src.startsWith('data:')) return src;
                    try {
                        const lastSlash = Math.max(
                            (artifactPaths.output || "").lastIndexOf('\\'),
                            (artifactPaths.output || "").lastIndexOf('/')
                        );
                        const baseDir = (artifactPaths.output || "").slice(0, lastSlash + 1);
                        const fullPath = src.includes(':') || src.startsWith('/') || src.startsWith('\\')
                            ? src : baseDir + src;
                        const b64 = await invoke<string>("read_image_base64", { path: fullPath });
                        const ext = src.split('.').pop()?.toLowerCase() || 'png';
                        return `data:${ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'};base64,${b64}`;
                    } catch {
                        return undefined;
                    }
                };

                // Extract screenshot src from a node's own msg[] only (non-recursive)
                const directScreenshotSrc = (obj: any): string | undefined => {
                    const msgs = Array.isArray(obj.msg) ? obj.msg : (obj.msg ? [obj.msg] : []);
                    for (const m of msgs) {
                        const txt = typeof m === 'object' ? (m["#text"] || "") : String(m ?? "");
                        if (txt.includes("src=")) {
                            const match = txt.match(/src=["'](.*?)["']/);
                            if (match) return match[1];
                        }
                    }
                    return undefined;
                };

                // Parse args array from obj.arg (may be string, object, or array)
                const parseArgs = (obj: any): string[] => {
                    const arr = Array.isArray(obj.arg) ? obj.arg : (obj.arg ? [obj.arg] : []);
                    return arr.map((a: any) => typeof a === 'object' ? (a["#text"] || "") : String(a ?? ""));
                };

                // Parse msg[] as text children, filtering img tags and stripping XML hierarchy blocks
                const parseMsgChildren = (obj: any): LogNode[] => {
                    const msgs = Array.isArray(obj.msg) ? obj.msg : (obj.msg ? [obj.msg] : []);
                    return msgs
                        .map((m: any) => typeof m === 'object' ? (m["#text"] || "") : String(m ?? ""))
                        .map((txt: string) => txt.replace(/<\?xml(?:[^>]*)?>\s*<hierarchy[\s\S]*?<\/hierarchy>/gi, '').trim())
                        .filter((txt: string) => txt && !txt.includes("src="))
                        .map((txt: string) => ({ type: 'text' as const, content: txt, id: `msg-${Math.random()}` }));
                };

                // Core recursive mapper
                const mapXmlNode = async (obj: any, nodeType?: string): Promise<LogNode | null> => {
                    if (!obj || typeof obj !== "object") return null;

                    const statusObj = typeof obj.status === 'object' ? obj.status : {};
                    const statusStr: string = statusObj.status || statusObj["status"] || 'PASS';
                    // RF4: starttime="20260319 14:55:56.033" / endtime="..."
                    // RF5+: start="20260319T145556.033" / end="..." OR elapsed="00:00:13.346"
                    const normalizeTs = (ts: string): string => {
                        if (!ts) return '';
                        const rf5 = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})$/);
                        if (rf5) return `${rf5[1]}${rf5[2]}${rf5[3]} ${rf5[4]}:${rf5[5]}:${rf5[6]}.${rf5[7]}`;
                        return ts;
                    };
                    const elapsedRaw: string = String(statusObj.elapsed || statusObj.elapsedtime || '');
                    const startTime: string = normalizeTs(statusObj.starttime || statusObj.start || '');
                    const endTime: string = normalizeTs(statusObj.endtime || statusObj.end || '');
                    // RF5+ uses elapsed as float seconds; RF4 uses starttime/endtime
                    const duration: string = elapsedRaw
                        ? formatElapsedSeconds(elapsedRaw)
                        : formatRobotDuration(startTime, endTime);
                    const name = String(obj.name || obj.variable || "").trim();
                    const id = `xml-${name}-${startTime || Math.random()}`.replace(/\s+/g, '-');

                    // --- SUITE ---
                    if (nodeType === 'suite') {

                        const children: LogNode[] = [];
                        const suites = Array.isArray(obj.suite) ? obj.suite : (obj.suite ? [obj.suite] : []);
                        for (const s of suites) { const n = await mapXmlNode(s, 'suite'); if (n) children.push(n); }
                        const tests = Array.isArray(obj.test) ? obj.test : (obj.test ? [obj.test] : []);
                        for (const t of tests) { const n = await mapXmlNode(t, 'test'); if (n) children.push(n); }
                        return { type: 'suite', id, name, status: statusStr as 'PASS' | 'FAIL', summary: '', duration, children };
                    }

                    // --- TEST ---
                    if (nodeType === 'test') {
                        const children: LogNode[] = [];
                        // RF5+: dedicated <setup> tag; RF4: <kw type="setup">
                        if (obj.setup) { const n = await mapXmlNode(obj.setup, 'setup'); if (n) children.push(n); }
                        const kws = Array.isArray(obj.kw) ? obj.kw : (obj.kw ? [obj.kw] : []);
                        for (const kw of kws) {
                            // RF4 encodes setup/teardown as kw with a `type` attribute
                            const kwAttrType = typeof kw.type === 'string' ? kw.type.toLowerCase() : 'kw';
                            const mappedType = kwAttrType === 'setup' ? 'setup' : kwAttrType === 'teardown' ? 'teardown' : 'kw';
                            const n = await mapXmlNode(kw, mappedType);
                            if (n) children.push(n);
                        }
                        const fors = Array.isArray(obj.for) ? obj.for : (obj.for ? [obj.for] : []);
                        for (const f of fors) { const n = await mapXmlNode(f, 'for'); if (n) children.push(n); }
                        const ifs = Array.isArray(obj.if) ? obj.if : (obj.if ? [obj.if] : []);
                        for (const ifn of ifs) {
                            const branches = Array.isArray(ifn.branch) ? ifn.branch : (ifn.branch ? [ifn.branch] : []);
                            for (const br of branches) { const n = await mapXmlNode(br, 'branch'); if (n) children.push(n); }
                        }
                        // RF5+: dedicated <teardown> tag; RF4: handled in kws loop above
                        if (obj.teardown) { const n = await mapXmlNode(obj.teardown, 'teardown'); if (n) children.push(n); }

                        let message = statusObj["#text"] || statusObj.message || (typeof obj.status === 'string' ? obj.status : "");
                        message = message.replace(/<\?xml(?:[^>]*)?>\s*<hierarchy[\s\S]*?<\/hierarchy>/gi, '');
                        message = message.trim();

                        if (name && message) details[name] = { message, name };
                        const testStatus = statusStr === 'SKIP' ? 'FAIL' : statusStr as 'PASS' | 'FAIL';
                        return {
                            type: 'test',
                            id, name,
                            status: testStatus,
                            logs: [],
                            children,
                            duration,
                            failureDetail: statusStr === 'FAIL' ? { message } : undefined
                        };
                    }

                    // --- KEYWORD ---
                    if (nodeType === 'kw' || nodeType === 'setup' || nodeType === 'teardown') {
                        const children: LogNode[] = [...parseMsgChildren(obj)];
                        const kws = Array.isArray(obj.kw) ? obj.kw : (obj.kw ? [obj.kw] : []);
                        for (const kw of kws) { const n = await mapXmlNode(kw, 'kw'); if (n) children.push(n); }
                        const fors = Array.isArray(obj.for) ? obj.for : (obj.for ? [obj.for] : []);
                        for (const f of fors) { const n = await mapXmlNode(f, 'for'); if (n) children.push(n); }
                        // Flatten IF: skip wrapper, push branches directly
                        const ifs = Array.isArray(obj.if) ? obj.if : (obj.if ? [obj.if] : []);
                        for (const ifn of ifs) {
                            const branches = Array.isArray(ifn.branch) ? ifn.branch : (ifn.branch ? [ifn.branch] : []);
                            for (const br of branches) { const n = await mapXmlNode(br, 'branch'); if (n) children.push(n); }
                        }
                        const whiles = Array.isArray(obj.while) ? obj.while : (obj.while ? [obj.while] : []);
                        for (const w of whiles) { const n = await mapXmlNode(w, 'while'); if (n) children.push(n); }

                        const screenshot = await resolveScreenshot(directScreenshotSrc(obj));
                        const args = parseArgs(obj);
                        const kwStatus: KeywordNode['status'] = statusStr === 'FAIL' ? 'FAIL' : statusStr === 'NOT RUN' ? 'NOT_RUN' : 'PASS';
                        const subType: KeywordSubType = nodeType === 'setup' ? 'setup' : nodeType === 'teardown' ? 'teardown' : 'keyword';

                        return { type: 'keyword', subType, id, name, library: obj.library, status: kwStatus, duration, args, screenshot, children } as KeywordNode;
                    }

                    // --- FOR loop ---
                    if (nodeType === 'for') {
                        const children: LogNode[] = [];
                        const iters = Array.isArray(obj.iter) ? obj.iter : (obj.iter ? [obj.iter] : []);
                        for (const it of iters) { const n = await mapXmlNode(it, 'iter'); if (n) children.push(n); }
                        // Var names come from the `name` attribute of each <var> element
                        const forVars = Array.isArray(obj.var) ? obj.var : (obj.var ? [obj.var] : []);
                        const forVarStr = forVars.map((v: any) => typeof v === 'object' ? (v['name'] || v['#text'] || '') : String(v ?? '')).join('  ');
                        const forFlavor = obj.flavor || 'IN RANGE';
                        const forName = [forVarStr, forFlavor, obj.start || obj.limit || ''].filter(Boolean).join('  ');
                        const kwStatus: KeywordNode['status'] = statusStr === 'FAIL' ? 'FAIL' : 'PASS';
                        return { type: 'keyword', subType: 'for', id, name: forName || 'FOR', status: kwStatus, duration, args: [], children } as KeywordNode;
                    }

                    // --- FOR iteration ---
                    if (nodeType === 'iter') {
                        const children: LogNode[] = [...parseMsgChildren(obj)];
                        const kws = Array.isArray(obj.kw) ? obj.kw : (obj.kw ? [obj.kw] : []);
                        for (const kw of kws) { const n = await mapXmlNode(kw, 'kw'); if (n) children.push(n); }
                        const ifs = Array.isArray(obj.if) ? obj.if : (obj.if ? [obj.if] : []);
                        for (const ifn of ifs) {
                            const branches = Array.isArray(ifn.branch) ? ifn.branch : (ifn.branch ? [ifn.branch] : []);
                            for (const br of branches) { const n = await mapXmlNode(br, 'branch'); if (n) children.push(n); }
                        }
                        if (obj.break) children.push({ type: 'keyword', subType: 'break', id: `break-${Math.random()}`, name: '', status: 'PASS', args: [], children: [] } as KeywordNode);
                        if (obj.continue) children.push({ type: 'keyword', subType: 'continue', id: `cont-${Math.random()}`, name: '', status: 'PASS', args: [], children: [] } as KeywordNode);

                        // Each <var name="${i}">0</var> → "${i} = 0"
                        const iterVars = Array.isArray(obj.var) ? obj.var : (obj.var ? [obj.var] : []);
                        const iterVarStr = iterVars
                            .map((v: any) => typeof v === 'object' ? `${v['name'] || ''}${v['#text'] != null ? ' = ' + v['#text'] : ''}`.trim() : String(v ?? ''))
                            .filter(Boolean)
                            .join('  ');
                        const kwStatus: KeywordNode['status'] = statusStr === 'FAIL' ? 'FAIL' : 'PASS';
                        return { type: 'keyword', subType: 'iteration', id, name: iterVarStr || '', status: kwStatus, duration, args: [], children } as KeywordNode;
                    }
                    // --- IF branch (wrapper IF node is skipped — branches are flattened to parent) ---
                    if (nodeType === 'branch') {
                        const children: LogNode[] = [...parseMsgChildren(obj)];
                        const kws = Array.isArray(obj.kw) ? obj.kw : (obj.kw ? [obj.kw] : []);
                        for (const kw of kws) { const n = await mapXmlNode(kw, 'kw'); if (n) children.push(n); }
                        const nestedIfs = Array.isArray(obj.if) ? obj.if : (obj.if ? [obj.if] : []);
                        for (const ifn of nestedIfs) {
                            const branches = Array.isArray(ifn.branch) ? ifn.branch : (ifn.branch ? [ifn.branch] : []);
                            for (const br of branches) { const n = await mapXmlNode(br, 'branch'); if (n) children.push(n); }
                        }
                        if (obj.break) children.push({ type: 'keyword', subType: 'break', id: `break-${Math.random()}`, name: '', status: 'PASS', args: [], children: [] } as KeywordNode);
                        const rawType: string = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'IF';
                        // Show only the condition, not the branch type keyword (pill handles the type label)
                        const condition: string = obj.condition ? obj.condition : '';
                        const subType: KeywordSubType = rawType === 'ELSE IF' ? 'else-if' : rawType === 'ELSE' ? 'else' : 'if';
                        const kwStatus: KeywordNode['status'] = statusStr === 'FAIL' ? 'FAIL' : statusStr === 'NOT RUN' ? 'NOT_RUN' : 'PASS';
                        return { type: 'keyword', subType, id, name: condition, status: kwStatus, duration, args: [], children } as KeywordNode;
                    }

                    // --- WHILE loop ---
                    if (nodeType === 'while') {
                        const children: LogNode[] = [];
                        const iters = Array.isArray(obj.iter) ? obj.iter : (obj.iter ? [obj.iter] : []);
                        for (const it of iters) { const n = await mapXmlNode(it, 'iter'); if (n) children.push(n); }
                        const kwStatus: KeywordNode['status'] = statusStr === 'FAIL' ? 'FAIL' : 'PASS';
                        return { type: 'keyword', subType: 'while', id, name: `WHILE  ${obj.condition || ''}`.trim(), status: kwStatus, duration, args: [], children } as KeywordNode;
                    }

                    return null;
                };


                if (jsonObj.robot && jsonObj.robot.suite) {
                    const rootSuite = jsonObj.robot.suite;
                    const rootNode = await mapXmlNode(rootSuite, 'suite');
                    if (rootNode) {
                        setTree([rootNode]);
                    }
                }

                // Details now attached directly to test nodes in the tree

                setDebugInfo({
                    xmlLength: xmlContent.length,
                    failuresFound: Object.keys(details).length,
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
    const renderNode = (node: LogNode, depth = 0): React.ReactNode => {
        if (node.type === 'text') {
            if (node.content.match(/^[-=]+$/)) return null;
            return <LinkRenderer key={node.id} content={node.content} />;
        }

        if (node.type === 'suite-start' || node.type === 'suite-end') {
            return null;
        }

        const kw = node.type === 'keyword' ? (node as KeywordNode) : null;
        const subType = kw?.subType ?? 'keyword';

        const isRunning = node.status === 'RUNNING';
        const isFailed = node.status === 'FAIL';
        const isNotRun = node.status === 'NOT_RUN';
        const isToggled = collapsedIds.has(node.id);

        // Open by default: suites, failed nodes, running nodes
        const isOpen = (node.type === 'suite' || isFailed || isRunning) ? !isToggled : isToggled;

        const borderColor = isRunning ? 'border-primary/50' : isNotRun ? 'border-outline-variant' : (isFailed ? 'border-error' : 'border-success');
        const summaryColor = isRunning ? 'text-on-surface-variant/80' : isNotRun ? 'text-on-surface-variant/50' : (isFailed ? 'text-red-400' : 'text-success');
        const bgColor = isRunning ? 'bg-primary/5' : isNotRun ? 'bg-surface-variant/10' : (isFailed ? 'bg-error/10' : 'bg-success/10');

        // Pill label + icon per subType
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
        const nodeKey = node.type === 'suite' ? 'suite' : node.type === 'test' ? 'test' : subType;
        const { label: pill, color: pillColor } = nodeConfig[nodeKey] ?? nodeConfig['keyword'];

        return (
            <div key={node.id} className={clsx(
                "mb-2 mt-1 border rounded-xl overflow-hidden border-outline-variant",
                isRunning && "animate-pulse-subtle",
                node.type === 'keyword' && "ml-2 border-none bg-transparent"
            )}>
                <div
                    role="button"
                    onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                    className={clsx(
                        "w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface-variant/30 transition-colors text-left relative z-10 cursor-pointer select-none",
                        node.type !== 'keyword' && `border-l-4 ${borderColor.replace('/50', '')}`,
                        node.type === 'keyword' && "bg-surface-variant/5 rounded-lg mb-1"
                    )}
                >
                    <div className="flex items-center gap-2 max-w-[70%]">
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
                                    {((node as KeywordNode).args || []).join(', ')}
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
                    <div className={clsx(
                        "p-2 bg-surface/30",
                        node.type !== 'keyword' ? "pl-6 border-t border-outline-variant/20" : "pl-4 ml-2 border-l border-outline-variant/30"
                    )}>
                        {node.type === 'test' && node.documentation && (
                            <div className="text-on-surface-variant/60 italic mb-2 px-2 py-1 bg-surface-variant/5 rounded text-[11px]">
                                {node.documentation}
                            </div>
                        )}

                        {/* Error Message - Pushed above children for better visibility */}
                        {isFailed && node.type === 'test' && (node as any).failureDetail && (
                            <div className="mb-3 p-2 bg-error/10 border-l-2 border-error rounded-r-lg flex items-start gap-2 shadow-sm">
                                <XCircle size={14} className="text-error mt-0.5 shrink-0" />
                                <span className="text-error font-medium whitespace-pre-wrap leading-tight text-[11px]">
                                    {(node as any).failureDetail.message}
                                </span>
                            </div>
                        )}

                        {/* Logs and Children */}
                        <div className="space-y-1">
                            {node.type === 'test' && (node as TestNode).logs.map((line, i) => (
                                <LinkRenderer key={i} content={line} />
                            ))}
                            {(node as any).children?.map((child: LogNode) => renderNode(child, depth + 1))}
                        </div>

                        {/* Keyword Screenshot */}
                        {node.type === 'keyword' && (node as KeywordNode).screenshot && (
                            <div className="mt-2 p-2 bg-black/10 border border-outline-variant/20 rounded-xl space-y-2">
                                <span className="font-bold text-on-surface-variant/60 uppercase text-[10px] tracking-wider flex items-center gap-1">
                                    <ImageIcon size={12} />
                                    {t('run_tab.console.screenshot', 'Screenshot')}
                                </span>
                                <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-outline-variant/30 max-w-md bg-black/20">
                                    <img
                                        src={(node as KeywordNode).screenshot}
                                        alt="Keyword screenshot"
                                        className="w-full h-auto object-contain hover:scale-105 transition-transform duration-500"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

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
                        {tree.map(node => renderNode(node))}
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
