const http = require('http');

const ACTION = process.argv[2]; // "click" or "scroll"
const X1 = parseInt(process.argv[3], 10);
const Y1 = parseInt(process.argv[4], 10);
const X2 = process.argv[5] ? parseInt(process.argv[5], 10) : 0;
const Y2 = process.argv[6] ? parseInt(process.argv[6], 10) : 0;
const WEB_URL = process.argv[7]; // optional: active website url to target target tab

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
        req.setTimeout(1500, () => req.destroy(new Error('Timeout')));
    });
}

async function run() {
    const port = 9222;
    let targets;
    try {
        targets = await getCDPTargets(port);
    } catch (e) {
        console.error(JSON.stringify({ error: "CDP browser is not running or accessible on port 9222." }));
        process.exit(1);
    }

    // Try to find the exact target tab matching the active URL if provided, otherwise default to the first page target
    let target = null;
    if (WEB_URL) {
        const normalize = (u) => u ? u.toLowerCase().replace(/\/$/, '') : '';
        const normWebUrl = normalize(WEB_URL);
        target = targets.find(t => t.type === 'page' && t.url && normalize(t.url).includes(normWebUrl));
    }
    
    if (!target) {
        target = targets.find(t => t.type === 'page');
    }

    if (!target || !target.webSocketDebuggerUrl) {
        console.error(JSON.stringify({ error: "No active page target found with WebSocket Debugger URL." }));
        process.exit(1);
    }

    const wsUrl = target.webSocketDebuggerUrl;
    if (typeof WebSocket === 'undefined') {
        console.error(JSON.stringify({ error: "WebSocket is not defined. Node 22+ required." }));
        process.exit(1);
    }

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    const activeRequests = new Set();

    ws.onmessage = (event) => {
        const res = JSON.parse(event.data);
        if (res.id !== undefined && pending.has(res.id)) {
            const { resolve, reject } = pending.get(res.id);
            pending.delete(res.id);
            if (res.error) reject(res.error);
            else resolve(res.result);
        } else if (res.method) {
            if (res.method === 'Network.requestWillBeSent') {
                const reqId = res.params.requestId;
                activeRequests.add(reqId);
            } else if (res.method === 'Network.loadingFinished' || res.method === 'Network.loadingFailed') {
                const reqId = res.params.requestId;
                activeRequests.delete(reqId);
            }
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

    // Setup Page, Network, and Runtime domains
    await sendCmd('Page.enable');
    try {
        await sendCmd('Network.enable');
    } catch (e) {}
    try {
        await sendCmd('Runtime.enable');
    } catch (e) {}

    try {
        await sendCmd('Page.bringToFront');
    } catch (err) {
        // Fallback or ignore if bringToFront is restricted
    }

    async function waitForDomStable(timeout = 5000) {
        const startTime = Date.now();
        let lastCount = 0;
        let stableTicks = 0;
        
        while (Date.now() - startTime < timeout) {
            let readyState = 'loading';
            let currentCount = 0;
            try {
                const evalRes = await sendCmd('Runtime.evaluate', {
                    expression: `(() => {
                        return {
                            readyState: document.readyState,
                            elementCount: document.getElementsByTagName('*').length
                        };
                    })()`,
                    returnByValue: true
                });
                if (evalRes && evalRes.result && evalRes.result.value) {
                    readyState = evalRes.result.value.readyState;
                    currentCount = evalRes.result.value.elementCount;
                }
            } catch (e) {
                // ignore
            }
            
            if (readyState === 'complete') {
                if (currentCount === lastCount && currentCount > 0) {
                    stableTicks++;
                    if (stableTicks >= 3) {
                        break;
                    }
                } else {
                    stableTicks = 0;
                    lastCount = currentCount;
                }
            } else {
                stableTicks = 0;
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async function waitForNetworkIdle(timeout = 5000, idleTime = 400) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let lastActiveTime = Date.now();
            
            const interval = setInterval(() => {
                const now = Date.now();
                if (activeRequests.size > 0) {
                    lastActiveTime = now;
                }
                
                if (now - lastActiveTime >= idleTime || now - startTime >= timeout) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    if (ACTION === 'click') {
        // 1. Move mouse to logical coordinate first to trigger hover state
        await sendCmd('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: X1,
            y: Y1
        });
        await new Promise(r => setTimeout(r, 20));

        // 2. Dispatch mousePressed with buttons bitmask (1 = Left Button)
        await sendCmd('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: X1,
            y: Y1,
            button: 'left',
            buttons: 1,
            clickCount: 1
        });
        
        await new Promise(r => setTimeout(r, 50));

        // 3. Dispatch mouseReleased with buttons bitmask (1 = Left Button)
        await sendCmd('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: X1,
            y: Y1,
            button: 'left',
            buttons: 1,
            clickCount: 1
        });

        // 4. Wait briefly for browser to react, then block on stabilization
        await new Promise(r => setTimeout(r, 150));
        await waitForDomStable(6000);
        await waitForNetworkIdle(6000, 400);
        await new Promise(r => setTimeout(r, 200)); // Layout settle
    } else if (ACTION === 'scroll') {
        // Delta calculation: swipe from start to end (so scroll direction is X1-X2, Y1-Y2)
        const deltaX = X1 - X2;
        const deltaY = Y1 - Y2;

        // Smart dynamic scrolling within scrollable containers or standard window fallback
        const scrollScript = `
            (() => {
                const x = ${X1};
                const y = ${Y1};
                const dx = ${deltaX};
                const dy = ${deltaY};
                
                // Clamp coordinates to viewport dimensions to ensure elementFromPoint succeeds
                const targetX = Math.max(0, Math.min(window.innerWidth - 1, x));
                const targetY = Math.max(0, Math.min(window.innerHeight - 1, y));
                
                let el = document.elementFromPoint(targetX, targetY);
                if (!el) el = document.body;
                
                function getScrollParent(node) {
                    if (node == null) {
                        return null;
                    }
                    if (node === document.body || node === document.documentElement) {
                        return window;
                    }
                    const style = window.getComputedStyle(node);
                    const overflowY = style.overflowY;
                    const overflowX = style.overflowX;
                    const isScrollable = (
                        (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight
                    ) || (
                        (overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth
                    );
                    if (isScrollable) {
                        return node;
                    }
                    return getScrollParent(node.parentNode);
                }
                
                const parent = getScrollParent(el);
                if (parent === window || !parent) {
                    window.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
                } else {
                    parent.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
                }
            })()
        `;

        await sendCmd('Runtime.evaluate', {
            expression: scrollScript,
        });
        await new Promise(r => setTimeout(r, 400)); // Settle scrolling animation
    } else if (ACTION === 'navigate') {
        if (!WEB_URL) {
            console.error(JSON.stringify({ error: "Missing navigation URL parameter." }));
            process.exit(1);
        }
        await sendCmd('Page.navigate', { url: WEB_URL });
        // Wait for page load
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 8000); // 8s timeout max for load
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
        // Run stabilization checks
        await waitForDomStable(6000);
        await waitForNetworkIdle(6000, 400);
        await new Promise(r => setTimeout(r, 200)); // Layout settle
    }

    ws.close();
    console.log(JSON.stringify({ success: true }));
}

run().catch((e) => {
    console.error(JSON.stringify({ error: e.message || String(e) }));
    process.exit(1);
});
