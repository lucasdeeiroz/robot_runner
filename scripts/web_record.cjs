const http = require('http');
const fs = require('fs');
const path = require('path');

const FRAMES_DIR = process.argv[2];
const STOP_FILE = process.argv[3];

if (!FRAMES_DIR || !STOP_FILE) {
    process.stderr.write(JSON.stringify({ error: 'Usage: web_record.cjs <frames_dir> <stop_file>' }) + '\n');
    process.exit(1);
}

function getCDPTargets(port) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
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
        process.stderr.write(JSON.stringify({ error: 'CDP browser is not running or accessible on port 9222.' }) + '\n');
        process.exit(1);
    }

    const target = targets.find(t => t.type === 'page');
    if (!target || !target.webSocketDebuggerUrl) {
        process.stderr.write(JSON.stringify({ error: 'No active page target found.' }) + '\n');
        process.exit(1);
    }

    if (typeof WebSocket === 'undefined') {
        process.stderr.write(JSON.stringify({ error: 'WebSocket not defined. Node 22+ is required.' }) + '\n');
        process.exit(1);
    }

    fs.mkdirSync(FRAMES_DIR, { recursive: true });

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let msgId = 1;
    const pending = new Map();
    let frameCount = 0;
    let stopped = false;

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
        } else if (msg.method === 'Page.screencastFrame' && !stopped) {
            const frameData = msg.params.data;
            const sessionId = msg.params.sessionId;
            const frameName = `frame_${String(frameCount++).padStart(6, '0')}.jpg`;
            fs.writeFileSync(path.join(FRAMES_DIR, frameName), Buffer.from(frameData, 'base64'));
            // Acknowledge to continue receiving frames
            ws.send(JSON.stringify({ id: msgId++, method: 'Page.screencastFrameAck', params: { sessionId } }));
        }
    };

    function sendCmd(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    await new Promise((resolve) => { ws.onopen = resolve; });

    await sendCmd('Page.enable');
    await sendCmd('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 2 });

    // Poll for stop signal file every 200ms
    await new Promise((resolve) => {
        const interval = setInterval(() => {
            if (fs.existsSync(STOP_FILE)) {
                clearInterval(interval);
                resolve();
            }
        }, 200);
    });

    stopped = true;
    try { await sendCmd('Page.stopScreencast'); } catch (_) {}
    ws.close();

    fs.writeFileSync(
        path.join(FRAMES_DIR, 'metadata.json'),
        JSON.stringify({ frameCount, framesDir: FRAMES_DIR })
    );

    process.stdout.write(JSON.stringify({ success: true, frameCount, framesDir: FRAMES_DIR }) + '\n');
}

run().catch((e) => {
    process.stderr.write(JSON.stringify({ error: e.message || String(e) }) + '\n');
    process.exit(1);
});
