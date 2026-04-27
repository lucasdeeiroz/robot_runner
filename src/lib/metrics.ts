import { invoke } from "@tauri-apps/api/core";
import { analytics } from "./firebase";
import { logEvent } from "firebase/analytics";

/**
 * Calculates the size of a folder (logs + screenshots) and reports it to Firebase Analytics.
 * This helps estimate future Cloud Storage costs.
 */
export async function logDataFootprint(resultsPath: string) {
    if (!resultsPath) return;

    try {
        // Call the Rust command to get the actual folder size in bytes
        const sizeBytes = await invoke<number>("get_folder_size", { path: resultsPath });
        const sizeMB = sizeBytes / (1024 * 1024);
        
        console.log(`[Metrics] Data footprint for ${resultsPath}: ${sizeMB.toFixed(2)} MB (${sizeBytes} bytes)`);
        
        const a = await analytics;
        if (a) {
            logEvent(a, "test_run_data_footprint", {
                size_bytes: sizeBytes,
                size_mb: parseFloat(sizeMB.toFixed(2)),
                debug_mode: true // Force appearance in Firebase DebugView
            });
        }
    } catch (error) {
        console.error("[Metrics] Failed to log data footprint:", error);
    }
}
