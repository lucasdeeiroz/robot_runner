import { invoke } from "@tauri-apps/api/core";
import { TestLog } from "@/lib/historyCache";

export interface PerformanceSummary {
    avgCpu: number;
    maxCpu: number;
    avgRam: number;
    maxRam: number;
    avgFps?: number;
    spikes: string[];
}

export interface DeepAnalysisContext {
    performance?: PerformanceSummary;
    anomalousLogs: string[];
    failureMessages: string[];
}

/**
 * Finds the most relevant performance CSV for a given test log based on timestamps.
 */
export async function findPerformanceData(testLog: TestLog, logsDir: string): Promise<string | null> {
    try {
        const files = await invoke<string[]>('list_files', { path: logsDir });
        const perfFiles = files.filter(f => f.startsWith('performance_') && f.endsWith('.csv'));
        
        if (perfFiles.length === 0) return null;

        // Test timestamp is usually like "2024-04-04 10:00:00" or similar
        // Perf filename is like "performance_2024-04-04T10-00-00.csv"
        const testDate = new Date(testLog.timestamp);
        const testTime = testDate.getTime();

        let bestFile = null;
        let minDiff = Infinity;

        for (const file of perfFiles) {
            // Extract ISO string part and parse
            const isoPart = file.replace('performance_', '').replace('.csv', '').replace(/-/g, ':').replace(/(\d{4}):(\d{2}):(\d{2})T/, '$1-$2-$3T');
            const fileDate = new Date(isoPart);
            const fileTime = fileDate.getTime();
            
            const diff = Math.abs(testTime - fileTime);
            // If the file was created within 5 minutes of the test start, it's likely relevant
            if (diff < 300000 && diff < minDiff) { 
                minDiff = diff;
                bestFile = file;
            }
        }

        return bestFile;
    } catch (e) {
        console.error("Failed to find performance data", e);
        return null;
    }
}

/**
 * Summarizes performance CSV data for AI consumption.
 * Yields to the event loop to keep the UI responsive during large file processing.
 */
export async function summarizePerformanceCsv(
    csvPath: string,
    onCancel?: () => boolean
): Promise<PerformanceSummary | null> {
    try {
        // Use read_file_tail to avoid loading massive CSVs into memory
        // 200KB is usually more than enough for performance analysis of a single test run
        const content = await invoke<string>('read_file_tail', { path: csvPath, maxBytes: 204800 });
        const lines = content.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return null;

        const header = lines[0].split(',');
        const dataLines = lines.slice(1);

        const cpuIdx = header.findIndex(h => h.includes('System_CPU') || h.includes('App_CPU'));
        const ramIdx = header.findIndex(h => h.includes('System_RAM') || h.includes('App_RAM'));
        const fpsIdx = header.findIndex(h => h.includes('FPS'));

        let totalCpu = 0, maxCpu = 0;
        let totalRam = 0, maxRam = 0;
        let totalFps = 0, fpsCount = 0;
        const spikes: string[] = [];

        for (let i = 0; i < dataLines.length; i++) {
            // Check for early cancellation
            if (onCancel?.()) return null;

            // Yield every 100 lines to keep UI responsive
            if (i % 100 === 0 && i > 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const line = dataLines[i];
            const cols = line.split(',');
            const cpu = parseFloat(cols[cpuIdx]);
            const ram = parseFloat(cols[ramIdx]);
            const fps = fpsIdx !== -1 ? parseFloat(cols[fpsIdx]) : NaN;

            if (!isNaN(cpu)) {
                totalCpu += cpu;
                if (cpu > maxCpu) maxCpu = cpu;
                if (cpu > 80) spikes.push(`High CPU spike (${cpu.toFixed(1)}%) at step ${i}`);
            }
            if (!isNaN(ram)) {
                totalRam += ram;
                if (ram > maxRam) maxRam = ram;
            }
            if (!isNaN(fps)) {
                totalFps += fps;
                fpsCount++;
                if (fps < 20) spikes.push(`Low FPS (${fps.toFixed(1)}) at step ${i}`);
            }
        }

        const count = dataLines.length;
        return {
            avgCpu: totalCpu / count,
            maxCpu,
            avgRam: totalRam / count,
            maxRam,
            avgFps: fpsCount > 0 ? totalFps / fpsCount : undefined,
            spikes: spikes.slice(0, 5) // Limit to top 5 spikes
        };
    } catch (e) {
        console.error("Failed to summarize performance CSV", e);
        return null;
    }
}

/**
 * Extracts failure messages and anomalous log patterns from Robot XML and Logcat.
 */
export async function extractAnomalousLogs(
    xmlPath: string,
    onCancel?: () => boolean
): Promise<{ failureMessages: string[], anomalousLogs: string[] }> {
    const failureMessages: string[] = [];
    const anomalousLogs: string[] = [];

    try {
        // 1. Extract failures from XML
        if (onCancel?.()) throw new Error("cancelled");
        const xmlContent = await invoke<string>('read_file', { path: xmlPath });
        // Quick extraction via regex (simple but effective for AI context)
        const statusMatches = xmlContent.matchAll(/<status[^>]*status="FAIL"[^>]*>([\s\S]*?)<\/status>/g);
        for (const match of statusMatches) {
            const msg = match[1].trim();
            if (msg && !failureMessages.includes(msg)) {
                failureMessages.push(msg.substring(0, 500)); // Cap each message
            }
        }

        // 2. Look for Logcat files in the same directory
        const lastSlash = Math.max(xmlPath.lastIndexOf('/'), xmlPath.lastIndexOf('\\'));
        const dirPath = lastSlash !== -1 ? xmlPath.substring(0, lastSlash) : '.';
        const files = await invoke<string[]>('list_files', { path: dirPath });
        const logcatFile = files.find(f => f.toLowerCase().includes('logcat') && f.endsWith('.log'));

        if (logcatFile) {
            const fullLogcatPath = `${dirPath}/${logcatFile}`;
            // Use read_file_tail for logcat as it can be huge. 
            // 250KB is enough for AI to diagnose failures.
            const logcatContent = await invoke<string>('read_file_tail', { path: fullLogcatPath, maxBytes: 256000 });
            
            // Search for critical patterns
            const criticalPatterns = [
                /FATAL EXCEPTION/i,
                /ANR in/i,
                /java\.lang\..*Error/i,
                /Native crash/i,
                /Out of memory/i
            ];

            const lines = logcatContent.split('\n');
            for (let i = 0; i < lines.length; i++) {
                // Check for early cancellation
                if (onCancel?.()) break;

                // Yield every 100 lines to keep UI responsive
                if (i % 100 === 0 && i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                const line = lines[i];
                if (criticalPatterns.some(p => p.test(line))) {
                    anomalousLogs.push(line.trim());
                }
            }
        }
    } catch (e) {
        console.error("Failed to extract anomalous logs", e);
    }

    return {
        failureMessages: failureMessages.slice(0, 10), // Top 10 failures
        anomalousLogs: anomalousLogs.slice(0, 20) // Top 20 log anomalies
    };
}

export interface AiContextResponse {
    context: string;
    metadata: any;
}

/**
 * Fetches optimized AI context from the Rust backend.
 * This replaces heavy frontend parsing of logs and XMLs.
 */
export async function getAiContext(
    type: 'history_analysis' | 'exploration' | 'artifact_generation' | 'flowchart_layout' | 'test_summary',
    params: {
        run_id?: string;
        db_path?: string;
        log_paths?: string[];
        failures_limit?: number;
        profile_id?: string;
        current_xml?: string;
        current_screenshot?: string;
        automation_root?: string;
        custom_mappings_dir?: string;
    }
): Promise<AiContextResponse> {
    return await invoke<AiContextResponse>('get_ai_context', { contextType: type, params });
}
