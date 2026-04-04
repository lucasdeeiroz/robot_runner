export interface TestLog {
    path: string;
    suite_name: string;
    status: 'PASS' | 'FAIL';
    device_udid?: string | null;
    device_model?: string | null;
    android_version?: string | null;
    timestamp: string;
    duration: string;
    pass_count: number;
    fail_count: number;
    xml_path: string;
    log_html_path: string;
    mtime: number;
    ai_summary?: string | null;
}

let cachedHistory: TestLog[] = [];

/**
 * Returns the currently cached test history.
 */
export function getCachedHistory(): TestLog[] {
    return cachedHistory;
}

/**
 * Updates the global test history cache.
 */
export function setCachedHistory(logs: TestLog[]) {
    cachedHistory = logs;
}
