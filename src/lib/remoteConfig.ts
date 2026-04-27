import { remoteConfig } from "./firebase";
import { fetchAndActivate, getValue } from "firebase/remote-config";

// Default configuration
// These values are used if the fetch fails or before it completes.
remoteConfig.defaultConfig = {
    "is_ai_analysis_enabled": true,
    "min_app_version": "2.2.0",
    "maintenance_mode": false,
    "storage_retention_days": 15,
    "show_home_stats": true
};

// Set minimum fetch interval to 1 hour for production, 0 for development
remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 3600000;

/**
 * Initializes and fetches the remote configuration from Firebase.
 */
export async function initRemoteConfig() {
    try {
        await fetchAndActivate(remoteConfig);
        console.log("[RemoteConfig] Config fetched and activated.");
    } catch (err) {
        console.error("[RemoteConfig] Failed to fetch remote config:", err);
    }
}

/**
 * Gets a boolean value from Remote Config.
 */
export function getRemoteBool(key: string): boolean {
    return getValue(remoteConfig, key).asBoolean();
}

/**
 * Gets a string value from Remote Config.
 */
export function getRemoteString(key: string): string {
    return getValue(remoteConfig, key).asString();
}

/**
 * Gets a number value from Remote Config.
 */
export function getRemoteNumber(key: string): number {
    return getValue(remoteConfig, key).asNumber();
}
