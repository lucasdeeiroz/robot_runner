import { remoteConfig } from "./firebase";
import { fetchAndActivate, getValue } from "firebase/remote-config";

// Default configuration shared between Firebase and Local Fallback
const DEFAULT_CONFIG: Record<string, any> = {
    "is_ai_analysis_enabled": true,
    "is_ask_rai_enabled": false,
    "min_app_version": "2.2.0",
    "maintenance_mode": false,
    "storage_retention_days": 15,
    "show_home_stats": true
};

if (remoteConfig) {
    remoteConfig.defaultConfig = DEFAULT_CONFIG;
    remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 3600000;
}

/**
 * Initializes and fetches the remote configuration from Firebase.
 * Includes a timeout to prevent blocking the app initialization indefinitely.
 */
export async function initRemoteConfig() {
    if (!remoteConfig) {
        console.warn("[RemoteConfig] Skipping fetch: Remote Config is not initialized.");
        return;
    }

    let timeoutId: any;
    try {
        const fetchPromise = fetchAndActivate(remoteConfig);
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("RemoteConfig timeout")), 5000);
        });

        await Promise.race([fetchPromise, timeoutPromise]);
        console.log("[RemoteConfig] Config fetched and activated.");
    } catch (err) {
        console.error("[RemoteConfig] Failed to fetch remote config:", err);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

/**
 * Gets a boolean value from Remote Config with a safe local fallback.
 */
export function getRemoteBool(key: string): boolean {
    if (!remoteConfig) return DEFAULT_CONFIG[key] ?? false;
    return getValue(remoteConfig, key).asBoolean();
}

/**
 * Gets a string value from Remote Config with a safe local fallback.
 */
export function getRemoteString(key: string): string {
    if (!remoteConfig) return DEFAULT_CONFIG[key] ?? "";
    return getValue(remoteConfig, key).asString();
}

/**
 * Gets a number value from Remote Config with a safe local fallback.
 */
export function getRemoteNumber(key: string): number {
    if (!remoteConfig) return DEFAULT_CONFIG[key] ?? 0;
    return getValue(remoteConfig, key).asNumber();
}
