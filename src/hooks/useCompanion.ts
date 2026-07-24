import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type CompanionStatus = 'disconnected' | 'connecting' | 'connected' | 'not_installed';

export interface CompanionEventItem {
    type: string;
    packageName: string;
    message: string;
    timestamp: number;
}

export interface CompanionDeviceInfo {
    status?: string;
    manufacturer: string;
    model: string;
    brand: string;
    androidVersion: string;
    sdkInt: number;
    serial: string;
    isAccessibilityEnabled?: boolean;
    battery?: {
        level: number;
        temperature: number;
        voltage: number;
        isCharging: boolean;
        health?: string;
        plugType?: string;
        currentNowmA?: number;
        currentAvgmA?: number;
    };
    storage?: {
        freeBytes: number;
        totalBytes: number;
    };
    nfc?: {
        isSupported: boolean;
        isEnabled: boolean;
    };
    printer?: {
        isSupported: boolean;
        hasPaper: boolean;
        coverOpen: boolean;
        isReady: boolean;
        vendor: string;
    };
}

export function useCompanion(selectedDevice: string | null) {
    const [status, setStatus] = useState<CompanionStatus>('disconnected');
    const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
    const [deviceInfo, setDeviceInfo] = useState<CompanionDeviceInfo | null>(null);
    const [recentEvents, setRecentEvents] = useState<CompanionEventItem[]>([]);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const checkInstallation = useCallback(async () => {
        if (!selectedDevice) {
            setIsInstalled(null);
            setStatus('disconnected');
            return false;
        }
        try {
            const installed = await invoke<boolean>('check_companion_installed', { device: selectedDevice });
            setIsInstalled(installed);
            if (!installed) {
                setStatus('not_installed');
            }
            return installed;
        } catch (e) {
            console.error("[useCompanion] Failed to check installation:", e);
            setIsInstalled(false);
            setStatus('not_installed');
            return false;
        }
    }, [selectedDevice]);

    const fetchDeviceStats = useCallback(async (port: number) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_info', { port });
            const data: CompanionDeviceInfo = JSON.parse(rawJson);
            setDeviceInfo(data);
            setStatus('connected');
            return true;
        } catch (err) {
            console.warn("[useCompanion] Failed to fetch device info via companion bridge:", err);
            setStatus('disconnected');
            return false;
        }
    }, []);

    const fetchRecentEvents = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_events', { port });
            const parsed = JSON.parse(rawJson);
            if (parsed.status === 'ok' && Array.isArray(parsed.events)) {
                setRecentEvents(parsed.events);
                return parsed.events as CompanionEventItem[];
            }
        } catch (e) {
            console.error("[useCompanion] Failed to fetch recent events:", e);
        }
        return [];
    }, []);

    const fetchInstantUiTree = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_ui_tree', { port });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to fetch instant UI tree:", e);
            throw e;
        }
    }, []);

    const enableAccessibility = useCallback(async () => {
        if (!selectedDevice) return;
        try {
            await invoke('enable_companion_accessibility', { device: selectedDevice });
            console.log("[useCompanion] Enabled accessibility service on device:", selectedDevice);
            setTimeout(() => {
                fetchDeviceStats(9876);
            }, 1000);
        } catch (e) {
            console.error("[useCompanion] Failed to enable accessibility service:", e);
            throw e;
        }
    }, [selectedDevice, fetchDeviceStats]);

    const generatePdfReport = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('generate_companion_pdf_report', { port });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to generate PDF report:", e);
            throw e;
        }
    }, []);

    const runStandaloneCheckup = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('run_companion_standalone_checkup', { port });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to run standalone checkup:", e);
            throw e;
        }
    }, []);

    const connectCompanion = useCallback(async () => {
        if (!selectedDevice) return;
        setStatus('connecting');
        console.log("[useCompanion] Connecting to Companion on device:", selectedDevice);

        try {
            const installed = await checkInstallation();
            if (!installed) {
                console.warn("[useCompanion] Companion app not installed");
                setStatus('not_installed');
                return;
            }

            // Setup ADB Forward
            const port = await invoke<number>('start_companion_forward', {
                device: selectedDevice,
                localPort: 9876,
                remotePort: 9876
            });
            console.log("[useCompanion] ADB port forward established on port:", port);

            // Initial fetch
            const success = await fetchDeviceStats(port);
            if (success) {
                console.log("[useCompanion] Companion connected successfully!");
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    fetchDeviceStats(port);
                    fetchRecentEvents(port);
                }, 5000);
            } else {
                console.warn("[useCompanion] Initial HTTP fetch failed. Service might not be ready.");
                setStatus('disconnected');
            }
        } catch (err) {
            console.error("[useCompanion] Connection error:", err);
            setStatus('disconnected');
        }
    }, [selectedDevice, checkInstallation, fetchDeviceStats, fetchRecentEvents]);

    const launchCompanion = useCallback(async () => {
        if (!selectedDevice) return;
        try {
            console.log("[useCompanion] Launching Companion App...");
            await invoke('launch_companion_app', { device: selectedDevice });
            setTimeout(() => {
                connectCompanion();
            }, 1200);
        } catch (e) {
            console.error("[useCompanion] Failed to launch companion app:", e);
        }
    }, [selectedDevice, connectCompanion]);

    const triggerAction = useCallback(async (endpoint: string, payload?: any) => {
        try {
            const result = await invoke<string>('trigger_companion_action', {
                port: 9876,
                endpoint,
                payload: payload ? JSON.stringify(payload) : null
            });
            return JSON.parse(result);
        } catch (e) {
            console.error(`[useCompanion] Failed to trigger action ${endpoint}:`, e);
            throw e;
        }
    }, []);

    useEffect(() => {
        if (selectedDevice) {
            checkInstallation();
        } else {
            setStatus('disconnected');
            setDeviceInfo(null);
            setRecentEvents([]);
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [selectedDevice, checkInstallation]);

    return {
        status,
        isInstalled,
        deviceInfo,
        recentEvents,
        checkInstallation,
        connectCompanion,
        launchCompanion,
        triggerAction,
        fetchInstantUiTree,
        fetchRecentEvents,
        enableAccessibility,
        generatePdfReport,
        runStandaloneCheckup
    };
}
