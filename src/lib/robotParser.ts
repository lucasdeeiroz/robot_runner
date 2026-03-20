export interface TextNode {
    type: 'text';
    content: string;
    isSystem?: boolean;
    id: string;
}

export interface SuiteStartNode {
    type: 'suite-start';
    name: string;
    originalLine: string;
    id: string;
}

export interface TestNode {
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

export interface SuiteEndNode {
    type: 'suite-end';
    name: string;
    documentation?: string;
    status: 'PASS' | 'FAIL';
    summary: string;
    id: string;
}

export interface SuiteNode {
    type: 'suite';
    id: string;
    name: string;
    documentation?: string;
    status: 'PASS' | 'FAIL' | 'RUNNING';
    summary: string;
    duration?: string;
    children: LogNode[];
}

export type KeywordSubType = 'keyword' | 'setup' | 'teardown' | 'for' | 'iteration' | 'if' | 'else-if' | 'else' | 'break' | 'continue' | 'while';

export interface KeywordNode {
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

export type LogNode = TextNode | SuiteStartNode | TestNode | SuiteNode | SuiteEndNode | KeywordNode;
export type LinearNode = TextNode | SuiteStartNode | SuiteEndNode;

export const formatRobotDuration = (start: string, end: string): string => {
    if (!start || !end) return "";
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

export const formatElapsedSeconds = (raw: string): string => {
    const total = parseFloat(raw);
    if (isNaN(total) || total < 0) return '';
    const pad = (n: number, z = 2) => n.toString().padStart(z, '0');
    const ms = Math.round((total % 1) * 1000);
    const secs = Math.floor(total) % 60;
    const mins = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return `${hours > 0 ? pad(hours) + ':' : ''}${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
};

export const normalizeTs = (ts: string): string => {
    if (!ts) return '';
    const rf5 = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})$/);
    if (rf5) return `${rf5[1]}${rf5[2]}${rf5[3]} ${rf5[4]}:${rf5[5]}:${rf5[6]}.${rf5[7]}`;
    return ts;
};

// Moved helper functions outside to be accessible by mapXmlNode
const resolveScreenshot = async (src: string | undefined, outputXmlPath: string, readImageBase64: (path: string) => Promise<string>): Promise<string | undefined> => {
    if (!src) return undefined;
    if (src.startsWith('data:')) return src;
    try {
        const lastSlash = Math.max(
            (outputXmlPath || "").lastIndexOf('\\'),
            (outputXmlPath || "").lastIndexOf('/')
        );
        const baseDir = (outputXmlPath || "").slice(0, lastSlash + 1);
        const fullPath = src.includes(':') || src.startsWith('/') || src.startsWith('\\')
            ? src : baseDir + src;
        const b64 = await readImageBase64(fullPath);
        const ext = src.split('.').pop()?.toLowerCase() || 'png';
        return `data:${ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'};base64,${b64}`;
    } catch {
        return undefined;
    }
};

const directScreenshotSrc = (obj: any): string | undefined => {
    const msgs = Array.isArray(obj.msg) ? obj.msg : (obj.msg ? [obj.msg] : []);
    for (const m of msgs) {
        const txt = typeof m === 'object' ? (m["#text"] || "") : String(m ?? "");
        if (txt.includes("src=")) {
            const match = txt.match(/src="([^"]+)"/);
            if (match) return match[1];
        }
    }
    return undefined;
};

const parseArgs = (obj: any): string[] => {
    const args: string[] = [];
    
    // 1. Standard <arg> elements (used by Keywords and some FOR loops)
    const arr = Array.isArray(obj.arg) ? obj.arg : (obj.arg ? [obj.arg] : []);
    const standardArgs = arr.map((a: any) => typeof a === 'object' ? (a["#text"] || "") : String(a ?? ""));

    // 2. IF / ELSE IF / WHILE condition attribute
    if (obj.condition) {
        args.push(String(obj.condition));
    }

    // 3. FOR loop and ITERation variables and values
    const vars = Array.isArray(obj.var) ? obj.var : (obj.var ? [obj.var] : []);
    const varDisplay = vars.map((v: any) => {
        if (typeof v === 'object') {
            const vName = v.name || v.key;
            const vText = v["#text"] !== undefined ? v["#text"] : (v.value !== undefined ? v.value : v.val);
            
            // If we have a name and some content, it's a resolved variable: ${i} = 0
            if (vName && vText !== undefined) {
                return `${vName} = ${vText}`;
            }
            return vText !== undefined ? String(vText) : (vName || "");
        }
        return String(v ?? "");
    });
    
    const values = Array.isArray(obj.value) ? obj.value : (obj.value ? [obj.value] : []);
    const valueTexts = values.map((v: any) => {
        if (typeof v === 'object') return v["#text"] !== undefined ? v["#text"] : (v.value || v.val || "");
        return String(v ?? "");
    });

    if (varDisplay.length > 0) {
        // Collect all potential values
        const allValues = [...valueTexts, ...standardArgs];
        
        // If it's a FOR loop with variable AND specific items
        if (allValues.length > 0) {
            const flavor = obj.flavor || "IN";
            // Check if it's actually an iteration value hidden in allValues
            if (varDisplay.length === 1 && allValues.length === 1 && flavor === "IN" && !obj.flavor) {
                // Heuristic: if it's just one var and one value, and no flavor, it's likely an iteration
                args.push(`${varDisplay[0]} = ${allValues[0]}`);
            } else {
                args.push(`${varDisplay.join(', ')} ${flavor} ${allValues.join(', ')}`);
            }
        } else {
            // Probably an ITERation: ${item} = val1 or just val1
            args.push(varDisplay.join(', '));
        }
    } else if (valueTexts.length > 0 && !obj.condition) {
        // Fallback for values without variables
        args.push(valueTexts.join(', '));
    } else {
        // Standard keywords or loops without explicit <var>
        args.push(...standardArgs);
    }

    return args.filter(a => a !== "" && a !== "undefined");
};

const parseMsgChildren = (obj: any): LogNode[] => {
    const msgs = Array.isArray(obj.msg) ? obj.msg : (obj.msg ? [obj.msg] : []);
    return msgs
        .map((m: any) => typeof m === 'object' ? (m["#text"] || "") : String(m ?? ""))
        .map((txt: string) => txt.replace(/<\?xml(?:[^>]*)?>\s*<hierarchy[\s\S]*?<\/hierarchy>/gi, '').trim())
        .filter((txt: string) => txt && !txt.includes("src="))
        .map((txt: string) => ({ type: 'text' as const, content: txt, id: `msg-${Math.random()}` }));
};

export const mapXmlNode = async (
    obj: any,
    outputXmlPath: string,
    readImageBase64: (path: string) => Promise<string>,
    nodeType?: string
): Promise<LogNode | null> => {
    if (!obj || typeof obj !== "object") return null;

    const statusObj = typeof obj.status === 'object' ? obj.status : {};
    const statusStr: string = statusObj.status || statusObj["status"] || 'PASS';

    const elapsedRaw: string = String(statusObj.elapsed || statusObj.elapsedtime || '');
    const startTime: string = normalizeTs(statusObj.starttime || statusObj.start || '');
    const endTime: string = normalizeTs(statusObj.endtime || statusObj.end || '');
    const duration: string = elapsedRaw
        ? formatElapsedSeconds(elapsedRaw)
        : formatRobotDuration(startTime, endTime);

    let name = String(obj.name || obj.variable || "").trim();
    const subType = nodeType as KeywordSubType;
    const idList = [name, startTime || String(Math.random())];
    const id = `xml-${idList.join('-')}`.replace(/\s+/g, '-');

    if (subType === 'iteration' && name.startsWith('${') && name.endsWith('}')) {
        name = "";
    }

    if (nodeType === 'suite') {
        const children: LogNode[] = [];
        const suites = Array.isArray(obj.suite) ? obj.suite : (obj.suite ? [obj.suite] : []);
        for (const s of suites) { const n = await mapXmlNode(s, outputXmlPath, readImageBase64, 'suite'); if (n) children.push(n); }
        const tests = Array.isArray(obj.test) ? obj.test : (obj.test ? [obj.test] : []);
        for (const t of tests) { const n = await mapXmlNode(t, outputXmlPath, readImageBase64, 'test'); if (n) children.push(n); }
        return { type: 'suite', id, name, status: statusStr as 'PASS' | 'FAIL', summary: '', duration, children };
    }

    if (nodeType === 'test') {
        const children: LogNode[] = [];
        if (obj.setup) { const n = await mapXmlNode(obj.setup, outputXmlPath, readImageBase64, 'setup'); if (n) children.push(n); }
        const kws = Array.isArray(obj.kw) ? obj.kw : (obj.kw ? [obj.kw] : []);
        for (const kw of kws) {
            const kwAttrType = typeof kw.type === 'string' ? kw.type.toLowerCase() : 'kw';
            const mappedType = kwAttrType === 'setup' ? 'setup' : 
                               kwAttrType === 'teardown' ? 'teardown' : 
                               kwAttrType === 'foritem' ? 'iteration' : 'kw';
            const n = await mapXmlNode(kw, outputXmlPath, readImageBase64, mappedType);
            if (n) children.push(n);
        }
        const fors = Array.isArray(obj.for) ? obj.for : (obj.for ? [obj.for] : []);
        for (const f of fors) { const n = await mapXmlNode(f, outputXmlPath, readImageBase64, 'for'); if (n) children.push(n); }
        const ifs = Array.isArray(obj.if) ? obj.if : (obj.if ? [obj.if] : []);
        for (const ifNode of ifs) {
            if (ifNode.branch) {
                const branchItems = Array.isArray(ifNode.branch) ? ifNode.branch : [ifNode.branch];
                for (const b of branchItems) {
                    const branchType = (b.type || "").toLowerCase();
                    const mappedBranchType = branchType === 'else if' ? 'else-if' : (branchType === 'else' ? 'else' : 'if');
                    const n = await mapXmlNode(b, outputXmlPath, readImageBase64, mappedBranchType);
                    if (n) children.push(n);
                }
            } else {
                const n = await mapXmlNode(ifNode, outputXmlPath, readImageBase64, 'if');
                if (n) children.push(n);
            }
        }
        const whiles = Array.isArray(obj.while) ? obj.while : (obj.while ? [obj.while] : []);
        for (const w of whiles) { const n = await mapXmlNode(w, outputXmlPath, readImageBase64, 'while'); if (n) children.push(n); }
        if (obj.teardown) { const n = await mapXmlNode(obj.teardown, outputXmlPath, readImageBase64, 'teardown'); if (n) children.push(n); }

        const failures: Record<string, { message: string, screenshot?: string, name: string }> = {};
        if (statusStr === 'FAIL') {
            const msg = typeof obj.status === 'object' && obj.status["#text"] ? obj.status["#text"] : "";
            failures[id] = { message: msg, name, screenshot: await resolveScreenshot(directScreenshotSrc(obj), outputXmlPath, readImageBase64) };
        }

        return {
            type: 'test', id, name, status: statusStr as 'PASS' | 'FAIL', duration, children,
            logs: [],
            failureDetail: failures[id] ? { message: failures[id].message, screenshot: failures[id].screenshot } : undefined
        };
    }

    const children: LogNode[] = [];

    if (obj.setup) { const n = await mapXmlNode(obj.setup, outputXmlPath, readImageBase64, 'setup'); if (n) children.push(n); }
    const kwItems = Array.isArray(obj.kw) ? obj.kw : (obj.kw ? [obj.kw] : []);
    for (const item of kwItems) {
        const kwAttrType = typeof item.type === 'string' ? item.type.toLowerCase() : 'kw';
        const mappedType = kwAttrType === 'setup' ? 'setup' : 
                           kwAttrType === 'teardown' ? 'teardown' : 
                           kwAttrType === 'foritem' ? 'iteration' : 'kw';
        const n = await mapXmlNode(item, outputXmlPath, readImageBase64, mappedType);
        if (n) children.push(n);
    }
    const forItems = Array.isArray(obj.for) ? obj.for : (obj.for ? [obj.for] : []);
    for (const f of forItems) { const n = await mapXmlNode(f, outputXmlPath, readImageBase64, 'for'); if (n) children.push(n); }
    const ifItems = Array.isArray(obj.if) ? obj.if : (obj.if ? [obj.if] : []);
    for (const ifItem of ifItems) {
        if (ifItem.branch) {
            const branchItems = Array.isArray(ifItem.branch) ? ifItem.branch : [ifItem.branch];
            for (const b of branchItems) {
                const branchType = (b.type || "").toLowerCase();
                const mappedBranchType = branchType === 'else if' ? 'else-if' : (branchType === 'else' ? 'else' : 'if');
                const n = await mapXmlNode(b, outputXmlPath, readImageBase64, mappedBranchType);
                if (n) children.push(n);
            }
        } else {
            const n = await mapXmlNode(ifItem, outputXmlPath, readImageBase64, 'if');
            if (n) children.push(n);
        }
    }
    const branchItems = Array.isArray(obj.branch) ? obj.branch : (obj.branch ? [obj.branch] : []);
    for (const b of branchItems) {
        const branchType = (b.type || "").toLowerCase();
        const mappedBranchType = branchType === 'else if' ? 'else-if' : (branchType === 'else' ? 'else' : 'if');
        const bStatusObj = typeof b.status === 'object' ? b.status : {};
        const bStatusStr = bStatusObj.status || 'PASS';
        const bKwStatus = bStatusStr === 'NOT RUN' ? 'NOT_RUN' : (bStatusStr === 'FAIL' ? 'FAIL' : 'PASS');
        const n = await mapXmlNode(b, outputXmlPath, readImageBase64, mappedBranchType);
        if (n) { (n as KeywordNode).status = bKwStatus; children.push(n); }
    }
    const iterItems = Array.isArray(obj.iter) ? obj.iter : (obj.iter ? [obj.iter] : []);
    for (const iter of iterItems) { const n = await mapXmlNode(iter, outputXmlPath, readImageBase64, 'iteration'); if (n) children.push(n); }
    const whileItems = Array.isArray(obj.while) ? obj.while : (obj.while ? [obj.while] : []);
    for (const w of whileItems) { const n = await mapXmlNode(w, outputXmlPath, readImageBase64, 'while'); if (n) children.push(n); }
    const breakItems = Array.isArray(obj.break) ? obj.break : (obj.break ? [obj.break] : []);
    for (const brk of breakItems) { const n = await mapXmlNode(brk, outputXmlPath, readImageBase64, 'break'); if (n) children.push(n); }
    const contItems = Array.isArray(obj.continue) ? obj.continue : (obj.continue ? [obj.continue] : []);
    for (const c of contItems) { const n = await mapXmlNode(c, outputXmlPath, readImageBase64, 'continue'); if (n) children.push(n); }
    if (obj.teardown) { const n = await mapXmlNode(obj.teardown, outputXmlPath, readImageBase64, 'teardown'); if (n) children.push(n); }

    children.push(...parseMsgChildren(obj));

    const kwStatus = statusStr === 'NOT RUN' ? 'NOT_RUN' : (statusStr === 'FAIL' ? 'FAIL' : 'PASS');
    const screenshot = await resolveScreenshot(directScreenshotSrc(obj), outputXmlPath, readImageBase64);

    return {
        type: 'keyword', subType: subType || 'keyword', id, name, status: kwStatus, screenshot, duration,
        args: parseArgs(obj), children
    };
};
