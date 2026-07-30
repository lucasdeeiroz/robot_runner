import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import packageJson from '../../package.json';
import { useSettings } from '../lib/settings';
import { useAuth } from '../lib/authStore';

export type CompanionStatus = 'disconnected' | 'connecting' | 'connected' | 'not_installed' | 'needs_update';

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
    const { settings } = useSettings();
    const { user } = useAuth();

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
            } else {
                const installedVersion = await getCompanionVersion();
                if (installedVersion !== packageJson.version && installedVersion !== null) {
                    setStatus('needs_update');
                }
            }
            return installed;
        } catch (e) {
            console.error("[useCompanion] Failed to check installation:", e);
            setIsInstalled(false);
            setStatus('not_installed');
            return false;
        }
    }, [selectedDevice]);

    const getCompanionVersion = useCallback(async () => {
        if (!selectedDevice) return null;
        try {
            const version = await invoke<string>('get_app_version', {
                device: selectedDevice,
                package: 'com.lucasdeeiroz.robotrunner'
            });
            // console.log("Versão do app:", version);
            return version;
        } catch (e) {
            console.error("[useCompanion] Failed to get companion version:", e);
            return null;
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

    const performNodeAction = useCallback(async (opts: { resourceId?: string; text?: string; contentDescription?: string; action?: string; value?: string }, port = 9876) => {
        try {
            const rawJson = await invoke<string>('perform_companion_node_action', {
                port,
                resourceId: opts.resourceId,
                text: opts.text,
                contentDescription: opts.contentDescription,
                action: opts.action || 'click',
                value: opts.value
            });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to perform node action:", e);
            throw e;
        }
    }, []);

    const syncTheme = useCallback(async (
        theme: string, 
        primaryColor: string, 
        userName?: string, 
        userEmail?: string,
        userPhotoBase64?: string,
        logoBase64?: string,
        port = 9876
    ) => {
        try {
            const payload = {
                theme,
                primaryColor,
                userName,
                userEmail,
                userPhotoBase64,
                logoBase64
            };
            const rawJson = await invoke<string>('trigger_companion_action', { 
                port, 
                endpoint: '/sync/theme',
                payload: JSON.stringify(payload)
            });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to sync theme:", e);
            return null;
        }
    }, []);

    const connectCompanion = useCallback(async () => {
        if (!selectedDevice) return;
        setStatus('connecting');
        console.log("[useCompanion] Connecting to Companion on device:", selectedDevice);

        // Prepare Logo Base64
        let logoBase64: string | undefined = undefined;
        const logoPath = settings.theme === 'light' ? settings.customLogoLight : settings.customLogoDark;
        if (logoPath) {
            try {
                if (logoPath.startsWith('data:')) {
                    logoBase64 = logoPath.split(',')[1];
                } else {
                    let data: Uint8Array | null = null;
                    try {
                        data = await readFile(logoPath);
                    } catch (e) {
                        if (logoPath.includes('/')) {
                            data = await readFile(logoPath.replace(/\//g, '\\'));
                        }
                    }
                    if (data) {
                        const uint8Array = new Uint8Array(data);
                        let binaryString = '';
                        // Process in chunks to avoid maximum call stack size and string concat bottleneck
                        const chunkSize = 8192;
                        for (let i = 0; i < uint8Array.length; i += chunkSize) {
                            const chunk = uint8Array.subarray(i, i + chunkSize);
                            binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                        }
                        logoBase64 = btoa(binaryString);
                    }
                }
            } catch (e) {
                console.warn("[useCompanion] Failed to load logo base64:", e);
            }
        }

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

            // Ensure Accessibility Service is enabled via ADB on selected device
            try {
                await invoke('enable_companion_accessibility', { device: selectedDevice });
            } catch (e) {
                console.warn("[useCompanion] Auto enable accessibility failed silently:", e);
            }

            // Initial fetch
            const success = await fetchDeviceStats(port);
            if (success) {
                console.log("[useCompanion] Companion connected successfully!");
                // Sync theme and user info on initial connection
                syncTheme(
                    settings.theme, 
                    settings.primaryColor || '#6366F1', 
                    (user?.displayName || user?.email) ?? undefined, 
                    user?.email ?? undefined, 
                    user?.photoURL ?? undefined, 
                    logoBase64, 
                    port
                );
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    fetchDeviceStats(port);
                    fetchRecentEvents(port);
                }, 5000);
            } else {
                console.warn("[useCompanion] Initial HTTP fetch failed. Attempting silent launch of Companion app...");
                try {
                    await invoke('launch_companion_app', { device: selectedDevice });
                    setTimeout(async () => {
                        const retrySuccess = await fetchDeviceStats(port);
                        if (retrySuccess) {
                            console.log("[useCompanion] Companion connected successfully after silent launch!");
                            syncTheme(
                                settings.theme, 
                                settings.primaryColor || '#6366F1', 
                                (user?.displayName || user?.email) ?? undefined, 
                                user?.email ?? undefined, 
                                user?.photoURL ?? undefined, 
                                logoBase64,
                                port
                            );
                            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                            pollIntervalRef.current = setInterval(() => {
                                fetchDeviceStats(port);
                                fetchRecentEvents(port);
                            }, 5000);
                        } else {
                            setStatus('disconnected');
                        }
                    }, 1500);
                } catch {
                    setStatus('disconnected');
                }
            }
        } catch (err) {
            console.error("[useCompanion] Connection error:", err);
            setStatus('disconnected');
        }
    }, [selectedDevice, checkInstallation, fetchDeviceStats, fetchRecentEvents, syncTheme, settings.theme, settings.primaryColor, user]);

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

    useEffect(() => {
        if (status === 'connected') {
            const logoPath = settings.theme === 'light' ? settings.customLogoLight : settings.customLogoDark;
            const syncThemeWithLogo = async () => {
                let logoBase64: string | undefined = undefined;
                if (logoPath) {
                    try {
                        if (logoPath.startsWith('data:')) {
                            logoBase64 = logoPath.split(',')[1];
                        } else {
                            let data: Uint8Array | null = null;
                            try {
                                data = await readFile(logoPath);
                            } catch (e) {
                                if (logoPath.includes('/')) {
                                    data = await readFile(logoPath.replace(/\//g, '\\'));
                                }
                            }
                            if (data) {
                                const uint8Array = new Uint8Array(data);
                                let binaryString = '';
                                const chunkSize = 8192;
                                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                                    const chunk = uint8Array.subarray(i, i + chunkSize);
                                    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                                }
                                logoBase64 = btoa(binaryString);
                            }
                        }
                    } catch (e) {
                        console.warn("[useCompanion] Failed to load logo base64 in useEffect:", e);
                    }
                }
                
                syncTheme(
                    settings.theme, 
                    settings.primaryColor || '#6366F1', 
                    (user?.displayName || user?.email) ?? undefined, 
                    user?.email ?? undefined, 
                    user?.photoURL ?? undefined,
                    logoBase64
                );
            };
            syncThemeWithLogo();
        }
    }, [settings.theme, settings.primaryColor, settings.customLogoLight, settings.customLogoDark, user, status, syncTheme]);

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

    const performTap = useCallback(async (x: number, y: number) => {
        return triggerAction('/action/tap', { x, y });
    }, [triggerAction]);

    useEffect(() => {
        if (selectedDevice) {
            checkInstallation().then(installed => {
                if (installed) {
                    connectCompanion();
                }
            });
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
    }, [selectedDevice, checkInstallation, connectCompanion]);

    const fetchArtifacts = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_artifacts', { port });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to fetch companion artifacts:", e);
            throw e;
        }
    }, []);

    const fetchFleetPeers = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_fleet_peers', { port });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to fetch companion fleet peers:", e);
            throw e;
        }
    }, []);

    const pushPayload = useCallback(async (payload: { artifactType: string; fileName: string; contentJson: string }, port = 9876) => {
        try {
            const rawJson = await invoke<string>('push_companion_payload', { port, payload: JSON.stringify(payload) });
            return JSON.parse(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to push companion payload:", e);
            throw e;
        }
    }, []);

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
        runStandaloneCheckup,
        performTap,
        performNodeAction,
        fetchArtifacts,
        fetchFleetPeers,
        pushPayload,
        syncTheme
    };
}
