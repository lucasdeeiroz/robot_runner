const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const TARGET_URL = process.argv[2] || 'https://google.com';
const BROWSER = process.argv[3] || 'chrome';

// Find browser path on Windows
function findBrowserPath() {
    const paths = {
        chrome: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        ],
        edge: [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ]
    };

    const targetType = BROWSER.includes('edge') ? 'edge' : 'chrome';
    for (const p of paths[targetType]) {
        if (fs.existsSync(p)) return p;
    }
    // Fallback search chrome, then edge
    for (const p of [...paths.chrome, ...paths.edge]) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// Request JSON from CDP endpoint
function getCDPTargets(port) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy(new Error('Timeout')));
    });
}

// Keep retrying connection
async function waitForCDP(port, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const targets = await getCDPTargets(port);
            return targets;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    throw new Error(`CDP server not available on port ${port}`);
}

// Helper to escape XML attributes
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Convert serialized JSON tree of elements into well-formed XML
function serializeToXml(node) {
    if (!node) return '';
    let attrStr = '';
    if (node.attributes) {
        for (const [k, v] of Object.entries(node.attributes)) {
            attrStr += ` ${k}="${escapeXml(v)}"`;
        }
    }

    if (!node.children || node.children.length === 0) {
        return `<node class="${escapeXml(node.tagName)}"${attrStr} />`;
    }

    let childrenXml = '';
    for (const child of node.children) {
        childrenXml += serializeToXml(child);
    }
    return `<node class="${escapeXml(node.tagName)}"${attrStr}>${childrenXml}</node>`;
}

async function capture() {
    const port = 9222;
    let targets;

    // Check if CDP is already listening
    try {
        targets = await getCDPTargets(port);
    } catch (e) {
        // Not running, let's launch
        const browserPath = findBrowserPath();
        if (!browserPath) {
            console.error(JSON.stringify({ error: "No suitable Chrome or MS Edge executable found in typical installation directories." }));
            process.exit(1);
        }

        const proc = spawn(browserPath, [
            '--headless=new',
            '--disable-gpu',
            `--remote-debugging-port=${port}`,
            '--window-size=1280,800',
            '--no-first-run',
            '--no-default-browser-check',
            '--user-data-dir=' + require('os').tmpdir() + '/chrome-tauri-runner'
        ], {
            detached: true,
            stdio: 'ignore'
        });
        proc.unref();

        targets = await waitForCDP(port);
    }

    // Reuse page or target
    let target = targets.find(t => t.type === 'page');
    if (!target) {
        // Create new tab via API
        await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${port}/json/new`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve());
            }).on('error', reject);
        });
        targets = await getCDPTargets(port);
        target = targets.find(t => t.type === 'page');
    }

    if (!target || !target.webSocketDebuggerUrl) {
        throw new Error("Could not find or create an active page target with a WebSocket debugger URL.");
    }

    const wsUrl = target.webSocketDebuggerUrl;

    // Initialize global WebSocket (guaranteed present in Node 22+)
    if (typeof WebSocket === 'undefined') {
        throw new Error("WebSocket is not defined. Node 22+ is required.");
    }

    const ws = new WebSocket(wsUrl);

    let id = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
        const res = JSON.parse(event.data);
        if (pending.has(res.id)) {
            const { resolve, reject } = pending.get(res.id);
            pending.delete(res.id);
            if (res.error) reject(res.error);
            else resolve(res.result);
        }
    };

    function sendCmd(method, params = {}) {
        return new Promise((resolve, reject) => {
            const reqId = id++;
            pending.set(reqId, { resolve, reject });
            ws.send(JSON.stringify({ id: reqId, method, params }));
        });
    }

    await new Promise((resolve) => ws.onopen = resolve);

    // Setup Page domain
    await sendCmd('Page.enable');

    // Navigate to Target URL
    await sendCmd('Page.navigate', { url: TARGET_URL });

    // Wait for Page Load event
    await new Promise((resolve) => {
        const timer = setTimeout(resolve, 6000); // 6s timeout max for load
        const handler = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.method === 'Page.loadEventFired') {
                ws.removeEventListener('message', handler);
                clearTimeout(timer);
                resolve();
            }
        };
        ws.addEventListener('message', handler);
    });

    // Pause briefly for layout and JS execution to settle
    await new Promise(resolve => setTimeout(resolve, 800));

    // Capture screenshot
    const screenshotRes = await sendCmd('Page.captureScreenshot', { format: 'png' });
    const screenshotBase64 = screenshotRes.data;

    // Execute DOM traversal script to build layout tree
    const script = `
        (() => {
            function getCssSelector(el) {
                if (el.id) return '#' + el.id;
                let path = [];
                while (el && el.nodeType === Node.ELEMENT_NODE) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.className) {
                        const classes = Array.from(el.classList).filter(c => !c.includes(':')).join('.');
                        if (classes) selector += '.' + classes;
                    }
                    path.unshift(selector);
                    el = el.parentNode;
                }
                return path.join(' > ');
            }

            function getXPath(el) {
                if (el.id) return "//" + el.nodeName.toLowerCase() + "[@id='" + el.id + "']";
                let path = [];
                while (el && el.nodeType === Node.ELEMENT_NODE) {
                    let index = 1;
                    let sib = el.previousSibling;
                    while (sib) {
                        if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === el.nodeName) {
                            index++;
                        }
                        sib = sib.previousSibling;
                    }
                    let tagName = el.nodeName.toLowerCase();
                    let pathIndex = '[' + index + ']';
                    path.unshift(tagName + pathIndex);
                    el = el.parentNode;
                }
                return '/' + path.join('/');
            }

            function isElementClickable(el) {
                const styles = window.getComputedStyle(el);
                if (styles.cursor === 'pointer') return true;
                if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return true;
                if (el.onclick || el.getAttribute('onclick')) return true;
                return false;
            }

            function traverse(el) {
                if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
                const rect = el.getBoundingClientRect();
                
                // Skip completely invisible nodes to optimize tree size
                if (rect.width === 0 || rect.height === 0) return null;

                const tag = el.tagName.toLowerCase();
                const text = el.innerText ? el.innerText.trim().substring(0, 100) : (el.value ? String(el.value).substring(0, 100) : '');

                const bounds = '[' + Math.round(rect.left) + ',' + Math.round(rect.top) + '][' + Math.round(rect.right) + ',' + Math.round(rect.bottom) + ']';

                const attributes = {
                    "resource-id": el.id || '',
                    "class": el.className || '',
                    "text": text,
                    "bounds": bounds,
                    "clickable": isElementClickable(el) ? 'true' : 'false',
                    "enabled": el.disabled ? 'false' : 'true',
                    "css": getCssSelector(el),
                    "xpath": getXPath(el)
                };

                // Add standard mobile mapper flags
                if (attributes['resource-id']) {
                    attributes['id'] = attributes['resource-id'];
                }

                const node = {
                    tagName: tag,
                    attributes: attributes,
                    children: []
                };

                for (let i = 0; i < el.children.length; i++) {
                    const childNode = traverse(el.children[i]);
                    if (childNode) {
                        node.children.push(childNode);
                    }
                }

                return node;
            }

            return traverse(document.body);
        })()
    `;

    const evalResult = await sendCmd('Runtime.evaluate', {
        expression: script,
        returnByValue: true
    });

    const jsonTree = evalResult.result.value;
    const innerXml = serializeToXml(jsonTree);
    const xml = `<?xml version="1.0" encoding="utf-8"?><hierarchy rotation="0">${innerXml}</hierarchy>`;

    ws.close();

    // Print output JSON to standard output
    console.log(JSON.stringify({
        screenshot: screenshotBase64,
        xml: xml
    }));
}

capture().catch((e) => {
    console.error(JSON.stringify({ error: e.message || String(e) }));
    process.exit(1);
});
