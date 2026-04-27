export interface TestLog {
    id?: string; // For Firestore document ID
    run_id?: string | null;
    logs_path?: string | null;
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
    is_remote?: boolean; // Indicates if this is a cloud-only record
    has_remote_sync?: boolean; // Indicates if a local record is also in the cloud
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
