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
 * Includes a timeout to prevent blocking the app initialization indefinitely.
 */
export async function initRemoteConfig() {
    try {
        // Add a 5-second timeout to the fetch operation
        const fetchPromise = fetchAndActivate(remoteConfig);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("RemoteConfig timeout")), 5000)
        );

        await Promise.race([fetchPromise, timeoutPromise]);
        console.log("[RemoteConfig] Config fetched and activated.");
    } catch (err) {
        console.error("[RemoteConfig] Failed to fetch remote config:", err);
        // We continue anyway as defaults are already set
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
